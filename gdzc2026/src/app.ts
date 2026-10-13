import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureUploadDirs, UPLOAD_ROOT } from "./lib/uploadPaths.js";
import { registerRoutes } from "./routes/index.js";
import { verifyToken } from "./services/authService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveWebDist(): string {
  return path.join(__dirname, "..", "web", "dist");
}

export async function buildApp() {
  ensureUploadDirs();
  const app = Fastify({
    logger: true,
    routerOptions: {
      /** 避免 /api/assets 与 /api/assets/ 及路由器与 /api/assets/:id 的匹配歧义 */
      ignoreTrailingSlash: true,
    },
  });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

  app.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (!url.startsWith("/api")) {
      return;
    }
    if (url === "/api/auth/login" || url === "/api/public/branding") {
      return;
    }
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "未登录", code: "UNAUTHORIZED" });
    }
    try {
      const payload = verifyToken(auth.slice(7).trim());
      request.authUser = {
        id: payload.sub,
        username: payload.u,
        role: payload.r ?? "admin",
      };
    } catch {
      return reply.status(401).send({ error: "登录已过期或无效", code: "TOKEN_INVALID" });
    }
  });

  await registerRoutes(app);

  await app.register(fastifyStatic, {
    root: UPLOAD_ROOT,
    prefix: "/uploads/",
    decorateReply: false,
  });

  const webDist = resolveWebDist();
  if (!fs.existsSync(webDist)) {
    app.get("/", async (_req, reply) => {
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>未构建前端</title>
<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;padding:24px;line-height:1.6;max-width:640px;margin:40px auto;}
code{background:#f5f5f5;padding:2px 6px;border-radius:4px;}</style></head><body>
<h1>尚未构建 Web 前端</h1>
<p>当前目录下没有 <code>web/dist</code>，因此无法提供管理界面。</p>
<p><strong>开发环境</strong>：请在项目根目录执行 <code>npm run dev</code>，然后使用浏览器打开 <strong>http://127.0.0.1:5173</strong>（不要只用 3000 端口）。</p>
<p><strong>生产环境</strong>：请先执行 <code>npm run build</code> 再 <code>npm start</code>。</p>
<p>健康检查接口仍可用：<a href="/health">/health</a></p>
</body></html>`;
      return reply.type("text/html").send(html);
    });
  }

  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
    });
    app.setNotFoundHandler(async (request, reply) => {
      const url = request.raw.url?.split("?")[0] ?? "";
      if (url.startsWith("/api")) {
        return reply.status(404).send({
          error: "Not found",
          method: request.method,
          path: url,
          hint: "无此 API 路由；请核对路径与 HTTP 方法是否与后端一致。",
        });
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return reply.status(404).send({ error: "Not found" });
      }
      const indexPath = path.join(webDist, "index.html");
      if (!fs.existsSync(indexPath)) {
        return reply.status(404).send({ error: "Not found" });
      }
      const html = await readFile(indexPath, "utf-8");
      return reply.type("text/html").send(html);
    });
  }

  return app;
}

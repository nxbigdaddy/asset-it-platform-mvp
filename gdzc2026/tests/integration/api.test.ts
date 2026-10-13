/**
 * API 集成测试：独立 SQLite（prisma/test-integration.sqlite），每次运行前 db push + seed。
 * 运行：npm test
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const TEST_DB_REL = "file:./test-integration.sqlite";
const TEST_DB_FILE = path.join(ROOT, "prisma", "test-integration.sqlite");

function prepareTestDatabase(): void {
  process.env.DATABASE_URL = TEST_DB_REL;
  process.env.DATABASE_PROVIDER = "sqlite";
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me";
  if (existsSync(TEST_DB_FILE)) {
    unlinkSync(TEST_DB_FILE);
  }
  const env = { ...process.env, DATABASE_URL: TEST_DB_REL, DATABASE_PROVIDER: "sqlite" };
  const opts = { cwd: ROOT, env, stdio: "pipe" as const, shell: true as const };
  execSync("node scripts/set-prisma-provider.mjs", opts);
  let out = execSync("npx prisma db push --skip-generate", opts);
  void out;
  out = execSync("npx tsx prisma/seed.ts", opts);
  void out;
}

prepareTestDatabase();

const { buildApp } = await import("../../src/app.js");
import type { FastifyInstance } from "fastify";

describe("HTTP API（集成）", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  test("GET /health 返回 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });

  test("GET /api/public/branding 可匿名访问", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/branding" });
    assert.equal(res.statusCode, 200);
    const j = JSON.parse(res.body) as { appTitle?: string };
    assert.ok(j.appTitle && j.appTitle.length > 0);
  });

  test("未携带 Token 访问 /api/assets 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/assets?take=5" });
    assert.equal(res.statusCode, 401);
  });

  test("POST /api/auth/login 错误密码返回 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin", password: "YOUR_PASSWORD" }),
    });
    assert.equal(res.statusCode, 401);
  });

  test("POST /api/auth/login 成功返回 token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin", password: "YOUR_PASSWORD" }),
    });
    assert.equal(res.statusCode, 200);
    const j = JSON.parse(res.body) as { token?: string; user?: { username?: string } };
    assert.ok(j.token && j.token.length > 10);
    assert.equal(j.user?.username, "admin");
  });

  test("携带 Token 可访问 /api/auth/me 与 /api/assets", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "operator", password: "YOUR_PASSWORD" }),
    });
    assert.equal(login.statusCode, 200);
    const { token } = JSON.parse(login.body) as { token: YOUR_SECRET };

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    const meBody = JSON.parse(me.body) as { username: string };
    assert.equal(meBody.username, "operator");

    const assets = await app.inject({
      method: "GET",
      url: "/api/assets?take=10",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(assets.statusCode, 200);
    const list = JSON.parse(assets.body) as { items: unknown[]; total: number };
    assert.ok(Array.isArray(list.items));
    assert.ok(typeof list.total === "number");
  });

  test("GET /api/assets/export.xlsx 返回表格文件", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin", password: "YOUR_PASSWORD" }),
    });
    const { token } = JSON.parse(login.body) as { token: YOUR_SECRET };
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/export.xlsx",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const ct = res.headers["content-type"] ?? "";
    assert.ok(
      String(ct).includes("spreadsheet") || String(ct).includes("octet-stream"),
      `unexpected content-type: ${ct}`,
    );
    assert.ok(res.rawPayload.length > 20);
  });

  test("GET /api/categories 与 /api/servers 需登录且可访问", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin", password: "YOUR_PASSWORD" }),
    });
    const { token } = JSON.parse(login.body) as { token: YOUR_SECRET };
    const auth = { authorization: `Bearer ${token}` };

    const cat = await app.inject({ method: "GET", url: "/api/categories", headers: auth });
    assert.equal(cat.statusCode, 200);
    const cats = JSON.parse(cat.body) as unknown[];
    assert.ok(Array.isArray(cats) && cats.length >= 1);

    const srv = await app.inject({ method: "GET", url: "/api/servers", headers: auth });
    assert.equal(srv.statusCode, 200);
    const servers = JSON.parse(srv.body) as unknown[];
    assert.ok(Array.isArray(servers));
  });

  test("GET /api/reports/summary-data 返回报表结构", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin", password: "YOUR_PASSWORD" }),
    });
    const { token } = JSON.parse(login.body) as { token: YOUR_SECRET };
    const res = await app.inject({
      method: "GET",
      url: "/api/reports/summary-data",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const j = JSON.parse(res.body) as Record<string, unknown>;
    assert.ok(typeof j === "object" && j !== null);
  });
});

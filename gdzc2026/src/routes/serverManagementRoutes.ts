import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ManagedServerOsType, ServerCredentialAuthType, ServerRoleKind } from "@prisma/client";
import { assertAdmin, assertNotViewer } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../services/auditService.js";
import {
  adExecuteWrite,
  adListOus,
  adSearchGroups,
  adSearchUsers,
  adListUsersInOu,
  adTestConnection,
  type AdWriteRequest,
} from "../services/serverManagement/adLdapAdapter.js";
import {
  createManagedServer,
  deleteManagedServer,
  deleteRoleBinding,
  getManagedServerById,
  listManagedServers,
  probeManagedServer,
  updateManagedServer,
  upsertRoleBinding,
} from "../services/serverManagement/managedServerService.js";
import {
  databaseProbeConnection,
  fileShareProbeConnection,
  printProbeConnection,
  webProbeConnection,
} from "../services/serverManagement/roleProbeService.js";
import { assertServerWriteAllowed } from "../services/serverManagement/serverPolicyService.js";

const adWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createOu"), parentDn: z.string().min(1), name: z.string().min(1) }),
  z.object({ action: z.literal("deleteEntry"), dn: z.string().min(1) }),
  z.object({
    action: z.literal("createUser"),
    parentDn: z.string().min(1),
    sAMAccountName: z.string().min(1),
    cn: z.string().min(1),
    displayName: z.string().optional(),
    password: YOUR_PASSWORD).optional(),
  }),
  z.object({
    action: z.literal("modifyUser"),
    dn: z.string().min(1),
    displayName: z.string().optional(),
    description: z.string().optional().nullable(),
    userAccountControl: z.string().optional(),
  }),
  z.object({ action: z.literal("setPassword"), dn: z.string().min(1), password: YOUR_PASSWORD).min(1) }),
  z.object({
    action: z.literal("addMemberToGroup"),
    groupDn: z.string().min(1),
    memberDn: z.string().min(1),
  }),
  z.object({
    action: z.literal("removeMemberFromGroup"),
    groupDn: z.string().min(1),
    memberDn: z.string().min(1),
  }),
]);

function redactAdWriteAudit(body: AdWriteRequest): unknown {
  if (body.action === "setPassword") return { action: body.action, dn: body.dn, password: "[REDACTED]" };
  if (body.action === "createUser" && body.password) return { ...body, password: "[REDACTED]" };
  return body;
}

async function assertBindingServer(serverId: string, bindingId: string) {
  const b = await prisma.serverRoleBinding.findFirst({
    where: { id: bindingId, serverId },
  });
  if (!b) throw new Error("角色绑定不存在或不属于该服务器");
  return b;
}

export function registerServerManagementRoutes(app: FastifyInstance): void {
  app.get("/api/servers", async (req, reply) => {
    if (!req.authUser?.id) return reply.status(401).send({ error: "未登录" });
    return listManagedServers();
  });

  app.get("/api/servers/:id", async (req, reply) => {
    if (!req.authUser?.id) return reply.status(401).send({ error: "未登录" });
    const id = (req.params as { id: string }).id;
    const row = await getManagedServerById(id);
    if (!row) return reply.status(404).send({ error: "不存在" });
    return row;
  });

  app.post("/api/servers", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        name: z.string().min(1),
        host: z.string().min(1),
        osType: z.enum(["WINDOWS", "LINUX", "OTHER"]).optional(),
        description: z.string().optional().nullable(),
        environment: z.string().optional().nullable(),
        enabled: z.boolean().optional(),
        credential: z
          .object({
            authType: z.enum(["PASSWORD", "KEY"]),
            username: z.string().optional().nullable(),
            secret: z.string().min(1),
            keyComment: z.string().optional().nullable(),
          })
          .optional(),
      })
      .parse(req.body);
    try {
      const row = await createManagedServer(
        {
          ...b,
          osType: b.osType as ManagedServerOsType | undefined,
          credential: b.credential
            ? {
                authType: b.credential.authType as ServerCredentialAuthType,
                username: b.credential.username,
                secret: b.credential.secret,
                keyComment: b.credential.keyComment,
              }
            : undefined,
        },
        req.authUser?.username,
      );
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/servers/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        name: z.string().optional(),
        host: z.string().optional(),
        osType: z.enum(["WINDOWS", "LINUX", "OTHER"]).optional(),
        description: z.string().optional().nullable(),
        environment: z.string().optional().nullable(),
        enabled: z.boolean().optional(),
        credential: z
          .union([
            z.object({
              authType: z.enum(["PASSWORD", "KEY"]),
              username: z.string().nullable(),
              secret: z.string().min(1),
              keyComment: z.string().nullable(),
            }),
            z.null(),
          ])
          .optional(),
      })
      .parse(req.body);
    try {
      return await updateManagedServer(
        id,
        {
          ...b,
          osType: b.osType as ManagedServerOsType | undefined,
          credential:
            b.credential === undefined
              ? undefined
              : b.credential === null
                ? null
                : {
                    authType: b.credential.authType as ServerCredentialAuthType,
                    username: b.credential.username,
                    secret: b.credential.secret,
                    keyComment: b.credential.keyComment,
                  },
        },
        req.authUser?.username,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/servers/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteManagedServer(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/servers/:id/probe", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await probeManagedServer(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "探活失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/servers/:id/roles", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const serverId = (req.params as { id: string }).id;
    const b = z
      .object({
        role: z.enum(["AD", "PRINT", "FILE_SHARE", "WEB", "DATABASE"]),
        isPrimary: z.boolean().optional(),
        configJson: z.string().optional(),
        allowWrite: z.boolean().optional(),
        allowAutomation: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const row = await upsertRoleBinding(
        serverId,
        {
          role: b.role as ServerRoleKind,
          isPrimary: b.isPrimary,
          configJson: b.configJson,
          allowWrite: b.allowWrite,
          allowAutomation: b.allowAutomation,
        },
        req.authUser?.username,
      );
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/servers/:serverId/roles/:bindingId", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    const b = z
      .object({
        isPrimary: z.boolean().optional(),
        configJson: z.string().optional(),
        allowWrite: z.boolean().optional(),
        allowAutomation: z.boolean().optional(),
      })
      .parse(req.body);
    const existing = await assertBindingServer(serverId, bindingId);
    const row = await prisma.serverRoleBinding.update({
      where: { id: bindingId },
      data: {
        ...(b.isPrimary !== undefined && { isPrimary: b.isPrimary }),
        ...(b.configJson !== undefined && { configJson: b.configJson }),
        ...(b.allowWrite !== undefined && { allowWrite: b.allowWrite }),
        ...(b.allowAutomation !== undefined && { allowAutomation: b.allowAutomation }),
      },
    });
    await writeAudit("ServerRoleBinding", bindingId, "PATCH", { ...b, role: existing.role }, req.authUser?.username);
    return row;
  });

  app.delete("/api/servers/:serverId/roles/:bindingId", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    await assertBindingServer(serverId, bindingId);
    await deleteRoleBinding(bindingId, req.authUser?.username);
    return reply.code(204).send();
  });

  app.post("/api/servers/:serverId/roles/:bindingId/ad/test", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    try {
      await assertBindingServer(serverId, bindingId);
      return await adTestConnection(serverId, bindingId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "测试失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/servers/:serverId/roles/:bindingId/ad/ous", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    try {
      await assertBindingServer(serverId, bindingId);
      return await adListOus(serverId, bindingId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "查询失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/servers/:serverId/roles/:bindingId/ad/users", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    const q = req.query as Record<string, string | undefined>;
    const take = q.take ? Math.min(parseInt(q.take, 10) || 50, 200) : 50;
    const search = q.q?.trim();
    try {
      await assertBindingServer(serverId, bindingId);
      return await adSearchUsers(serverId, bindingId, search, take);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "查询失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/servers/:serverId/roles/:bindingId/ad/users-in-ou", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    const q = req.query as Record<string, string | undefined>;
    const ouDn = (q.ouDn ?? "").trim();
    const take = q.take ? Math.min(parseInt(q.take, 10) || 50, 200) : 50;
    if (!ouDn) return reply.status(400).send({ error: "ouDn 不能为空" });
    try {
      await assertBindingServer(serverId, bindingId);
      return await adListUsersInOu(serverId, bindingId, ouDn, take);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "查询失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/servers/:serverId/roles/:bindingId/ad/groups", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    const q = req.query as Record<string, string | undefined>;
    const take = q.take ? Math.min(parseInt(q.take, 10) || 50, 200) : 50;
    const search = q.q?.trim();
    try {
      await assertBindingServer(serverId, bindingId);
      return await adSearchGroups(serverId, bindingId, search, take);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "查询失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/servers/:serverId/roles/:bindingId/ad/write", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    const body = adWriteSchema.parse(req.body) as AdWriteRequest;
    const rb = await assertBindingServer(serverId, bindingId);
    if (rb.role !== "AD") return reply.status(400).send({ error: "非 AD 绑定" });
    const pol = await assertServerWriteAllowed(rb.allowWrite);
    if (!pol.ok) return reply.status(403).send({ error: pol.reason });
    try {
      const result = await adExecuteWrite(serverId, bindingId, body);
      await writeAudit("ServerRoleBinding", bindingId, "AD_WRITE", redactAdWriteAudit(body), req.authUser?.username);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失败";
      await writeAudit(
        "ServerRoleBinding",
        bindingId,
        "AD_WRITE_FAILED",
        { body: redactAdWriteAudit(body), error: msg },
        req.authUser?.username,
      );
      return reply.status(400).send({ error: msg });
    }
  });

  async function runPrintProbe(serverId: string, bindingId: string) {
    const rb = await assertBindingServer(serverId, bindingId);
    if (rb.role !== "PRINT") throw new Error("非打印角色");
    const s = await prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!s) throw new Error("服务器不存在");
    return printProbeConnection(s.host, rb.configJson);
  }

  async function runFileShareProbe(serverId: string, bindingId: string) {
    const rb = await assertBindingServer(serverId, bindingId);
    if (rb.role !== "FILE_SHARE") throw new Error("非文件共享角色");
    const s = await prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!s) throw new Error("服务器不存在");
    return fileShareProbeConnection(s.host, rb.configJson);
  }

  async function runWebProbe(serverId: string, bindingId: string) {
    const rb = await assertBindingServer(serverId, bindingId);
    if (rb.role !== "WEB") throw new Error("非 Web 角色");
    const s = await prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!s) throw new Error("服务器不存在");
    return webProbeConnection(s.host, rb.configJson);
  }

  async function runDatabaseProbe(serverId: string, bindingId: string) {
    const rb = await assertBindingServer(serverId, bindingId);
    if (rb.role !== "DATABASE") throw new Error("非数据库角色");
    const s = await prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!s) throw new Error("服务器不存在");
    return databaseProbeConnection(s.host, rb.configJson);
  }

  const runRoleProbe = async (
    req: FastifyRequest,
    reply: FastifyReply,
    fn: (serverId: string, bindingId: string) => ReturnType<typeof databaseProbeConnection>,
  ) => {
    if (!assertNotViewer(req, reply)) return;
    const { serverId, bindingId } = req.params as { serverId: string; bindingId: string };
    try {
      return await fn(serverId, bindingId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "探活失败";
      return reply.status(400).send({ error: msg });
    }
  };

  app.post("/api/servers/:serverId/roles/:bindingId/print/probe", (req, reply) =>
    runRoleProbe(req, reply, runPrintProbe),
  );
  app.get("/api/servers/:serverId/roles/:bindingId/print/scan", (req, reply) =>
    runRoleProbe(req, reply, runPrintProbe),
  );

  app.post("/api/servers/:serverId/roles/:bindingId/file-share/probe", (req, reply) =>
    runRoleProbe(req, reply, runFileShareProbe),
  );
  app.get("/api/servers/:serverId/roles/:bindingId/file-share/scan", (req, reply) =>
    runRoleProbe(req, reply, runFileShareProbe),
  );

  app.post("/api/servers/:serverId/roles/:bindingId/web/probe", (req, reply) =>
    runRoleProbe(req, reply, runWebProbe),
  );
  app.get("/api/servers/:serverId/roles/:bindingId/web/scan", (req, reply) =>
    runRoleProbe(req, reply, runWebProbe),
  );

  app.post("/api/servers/:serverId/roles/:bindingId/database/probe", (req, reply) =>
    runRoleProbe(req, reply, runDatabaseProbe),
  );
  app.get("/api/servers/:serverId/roles/:bindingId/database/scan", (req, reply) =>
    runRoleProbe(req, reply, runDatabaseProbe),
  );
}

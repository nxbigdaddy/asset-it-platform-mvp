import net from "node:net";
import type { ManagedServerOsType, ServerCredentialAuthType, ServerRoleKind } from "@prisma/client";
import { sealCredential } from "../../lib/serverCredentialCrypto.js";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../auditService.js";
import { resolveDatabasePortsFromConfig } from "./databasePorts.js";

export type ManagedServerListItem = {
  id: string;
  name: string;
  host: string;
  osType: ManagedServerOsType;
  description: string | null;
  environment: string | null;
  enabled: boolean;
  lastProbeAt: Date | null;
  lastProbeOk: boolean | null;
  lastProbeMsg: string | null;
  hasCredential: boolean;
  roles: { id: string; role: ServerRoleKind; isPrimary: boolean; allowWrite: boolean }[];
};

function maskServer<T extends { credential: unknown }>(row: T): Omit<T, "credential"> & { hasCredential: boolean } {
  const { credential, ...rest } = row;
  return { ...rest, hasCredential: Boolean(credential) } as Omit<T, "credential"> & { hasCredential: boolean };
}

export async function listManagedServers(): Promise<ManagedServerListItem[]> {
  const rows = await prisma.managedServer.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      credential: { select: { id: true } },
      roleBindings: { select: { id: true, role: true, isPrimary: true, allowWrite: true } },
    },
  });
  return rows.map((r) => {
    const { credential, roleBindings, ...base } = r;
    return {
      ...base,
      hasCredential: Boolean(credential),
      roles: roleBindings,
    };
  });
}

export async function getManagedServerById(id: string) {
  const row = await prisma.managedServer.findUnique({
    where: { id },
    include: {
      credential: { select: { id: true, authType: true, username: true, keyComment: true, updatedAt: true } },
      roleBindings: true,
    },
  });
  return row;
}

export type CreateManagedServerInput = {
  name: string;
  host: string;
  osType?: ManagedServerOsType;
  description?: string | null;
  environment?: string | null;
  enabled?: boolean;
  credential?: {
    authType: ServerCredentialAuthType;
    username?: string | null;
    secret: string;
    keyComment?: string | null;
  };
};

export async function createManagedServer(input: CreateManagedServerInput, actor?: string) {
  const server = await prisma.managedServer.create({
    data: {
      name: input.name.trim(),
      host: input.host.trim(),
      osType: input.osType ?? "OTHER",
      description: input.description?.trim() ?? undefined,
      environment: input.environment?.trim() ?? undefined,
      enabled: input.enabled ?? true,
      ...(input.credential && {
        credential: {
          create: {
            authType: input.credential.authType,
            username: input.credential.username ?? undefined,
            secretEnc: sealCredential(input.credential.secret),
            keyComment: input.credential.keyComment ?? undefined,
          },
        },
      }),
    },
    include: { roleBindings: true, credential: { select: { id: true } } },
  });
  await writeAudit("ManagedServer", server.id, "CREATE", { name: server.name, host: server.host }, actor);
  return getManagedServerById(server.id);
}

export type UpdateManagedServerInput = Partial<{
  name: string;
  host: string;
  osType: ManagedServerOsType;
  description: string | null;
  environment: string | null;
  enabled: boolean;
  credential: {
    authType: ServerCredentialAuthType;
    username: string | null;
    secret: string;
    keyComment: string | null;
  } | null;
}>;

export async function updateManagedServer(id: string, input: UpdateManagedServerInput, actor?: string) {
  await prisma.managedServer.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.host !== undefined && { host: input.host.trim() }),
      ...(input.osType !== undefined && { osType: input.osType }),
      ...(input.description !== undefined && { description: input.description ?? undefined }),
      ...(input.environment !== undefined && { environment: input.environment ?? undefined }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  });
  if (input.credential !== undefined) {
    if (input.credential === null) {
      await prisma.serverCredential.deleteMany({ where: { serverId: id } });
    } else {
      await prisma.serverCredential.upsert({
        where: { serverId: id },
        create: {
          serverId: id,
          authType: input.credential.authType,
          username: input.credential.username ?? undefined,
          secretEnc: sealCredential(input.credential.secret),
          keyComment: input.credential.keyComment ?? undefined,
        },
        update: {
          authType: input.credential.authType,
          username: input.credential.username ?? undefined,
          secretEnc: sealCredential(input.credential.secret),
          keyComment: input.credential.keyComment ?? undefined,
        },
      });
    }
  }
  await writeAudit("ManagedServer", id, "UPDATE", input, actor);
  return getManagedServerById(id);
}

export async function deleteManagedServer(id: string, actor?: string) {
  await prisma.managedServer.delete({ where: { id } });
  await writeAudit("ManagedServer", id, "DELETE", {}, actor);
}

export function tcpProbe(host: string, port: number, timeoutMs = 4000): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve({ ok: true, message: `TCP ${host}:${port} 可达` });
    });
    socket.on("error", (e) => {
      resolve({ ok: false, message: e instanceof Error ? e.message : String(e) });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, message: "连接超时" });
    });
  });
}

export async function probeManagedServer(id: string, actor?: string) {
  const server = await prisma.managedServer.findUnique({
    where: { id },
    include: { roleBindings: true },
  });
  if (!server) throw new Error("服务器不存在");

  const ports: number[] = [];
  for (const rb of server.roleBindings) {
    try {
      if (rb.role === "DATABASE") {
        ports.push(...resolveDatabasePortsFromConfig(rb.configJson || "{}"));
        continue;
      }
      const cfg = JSON.parse(rb.configJson || "{}") as { ldapUrl?: string; probePort?: number };
      if (typeof cfg.probePort === "number") ports.push(cfg.probePort);
      if (cfg.ldapUrl?.startsWith("ldaps://")) ports.push(636);
      else if (cfg.ldapUrl?.startsWith("ldap://")) {
        const m = cfg.ldapUrl.match(/:(\d+)\/?$/);
        if (m) ports.push(parseInt(m[1], 10));
        else ports.push(389);
      }
    } catch {
      /* ignore */
    }
  }
  if (ports.length === 0) {
    ports.push(389, 445, 80);
  }
  const uniq = [...new Set(ports)];
  let lastMsg = "";
  let anyOk = false;
  for (const p of uniq) {
    const r = await tcpProbe(server.host, p);
    lastMsg = `[${p}] ${r.message}`;
    if (r.ok) {
      anyOk = true;
      break;
    }
  }
  await prisma.managedServer.update({
    where: { id },
    data: {
      lastProbeAt: new Date(),
      lastProbeOk: anyOk,
      lastProbeMsg: lastMsg,
    },
  });
  await writeAudit("ManagedServer", id, "PROBE", { ok: anyOk, message: lastMsg }, actor);
  return { ok: anyOk, message: lastMsg, checkedPorts: uniq };
}

export type RoleBindingInput = {
  role: ServerRoleKind;
  isPrimary?: boolean;
  configJson?: string;
  allowWrite?: boolean;
  allowAutomation?: boolean;
};

export async function upsertRoleBinding(serverId: string, input: RoleBindingInput, actor?: string) {
  const row = await prisma.serverRoleBinding.upsert({
    where: {
      serverId_role: { serverId, role: input.role },
    },
    create: {
      serverId,
      role: input.role,
      isPrimary: input.isPrimary ?? false,
      configJson: input.configJson ?? "{}",
      allowWrite: input.allowWrite ?? false,
      allowAutomation: input.allowAutomation ?? true,
    },
    update: {
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.configJson !== undefined && { configJson: input.configJson }),
      ...(input.allowWrite !== undefined && { allowWrite: input.allowWrite }),
      ...(input.allowAutomation !== undefined && { allowAutomation: input.allowAutomation }),
    },
  });
  await writeAudit("ServerRoleBinding", row.id, "UPSERT", { role: input.role }, actor);
  return row;
}

export async function deleteRoleBinding(bindingId: string, actor?: string) {
  await prisma.serverRoleBinding.delete({ where: { id: bindingId } });
  await writeAudit("ServerRoleBinding", bindingId, "DELETE", {}, actor);
}

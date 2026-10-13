import type { Entry } from "ldapts";
import { Attribute, Change, Client } from "ldapts";
import { revealCredential } from "../../lib/serverCredentialCrypto.js";
import { prisma } from "../../lib/prisma.js";
import { getLdapClientTimeouts } from "./ldapClientSettings.js";

function entryAttr(e: Entry, name: string): string {
  const v = e[name];
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) {
    const x = v[0];
    if (x === undefined || x === null) return "";
    if (Buffer.isBuffer(x)) return x.toString("utf8");
    return String(x);
  }
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  const s = String(v);
  return s.trim() === "undefined" ? "" : s;
}

export type AdRoleConfig = {
  ldapUrl?: string;
  baseDN: string;
  /** 若绑定账号 DN 与凭据用户名不同，可在此指定完整 bindDN */
  bindDN?: string;
  tlsRejectUnauthorized?: boolean;
};

function parseConfig(json: string): AdRoleConfig {
  const o = JSON.parse(json || "{}") as Record<string, unknown>;
  const baseDN = typeof o.baseDN === "string" ? o.baseDN : "";
  if (!baseDN.trim()) throw new Error("AD 配置缺少 baseDN");
  return {
    baseDN: baseDN.trim(),
    ldapUrl: typeof o.ldapUrl === "string" ? o.ldapUrl : undefined,
    bindDN: typeof o.bindDN === "string" ? o.bindDN : undefined,
    tlsRejectUnauthorized: o.tlsRejectUnauthorized === false ? false : true,
  };
}

function buildLdapUrl(host: string, cfg: AdRoleConfig): string {
  if (cfg.ldapUrl?.trim()) return cfg.ldapUrl.trim();
  return `ldap://${host}:389`;
}

function assertDnUnderBase(dn: string, baseDN: string): void {
  const d = dn.trim().toLowerCase();
  const b = baseDN.trim().toLowerCase();
  if (!d.endsWith(b)) throw new Error("DN 必须在配置的 baseDN 命名空间内");
}

/** 禁止在 RDN 段使用易破坏 DN 结构的字符（简化校验） */
function assertSafeRdnSegment(s: string, label: string): void {
  if (!s.trim()) throw new Error(`${label} 不能为空`);
  if (/[,\x00]/.test(s)) throw new Error(`${label} 不能包含逗号或空字符`);
}

async function withAdClient<T>(
  serverId: string,
  roleBindingId: string,
  fn: (client: Client, cfg: AdRoleConfig, ldapUrl: string) => Promise<T>,
): Promise<T> {
  const { cfg, url, bindDN, password } = await getAdContext(serverId, roleBindingId);
  const { timeout, connectTimeout } = await getLdapClientTimeouts();
  const client = new Client({
    url,
    timeout,
    connectTimeout,
    strictDN: false,
    ...(url.startsWith("ldaps://") && {
      tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized !== false },
    }),
  });
  try {
    await client.bind(bindDN, password);
    return await fn(client, cfg, url);
  } finally {
    await client.unbind().catch(() => {});
  }
}

async function setUnicodePassword(client: Client, userDn: string, password: YOUR_PASSWORD): Promise<void> {
  const quoted = Buffer.from(`"${password}"`, "utf16le");
  await client.modify(userDn, [
    new Change({
      operation: "replace",
      modification: new Attribute({ type: "unicodePwd", values: [quoted] }),
    }),
  ]);
}

async function getAdContext(serverId: string, roleBindingId: string) {
  const rb = await prisma.serverRoleBinding.findFirst({
    where: { id: roleBindingId, serverId, role: "AD" },
    include: {
      server: { include: { credential: true } },
    },
  });
  if (!rb) throw new Error("未找到 AD 角色绑定");
  const cred = rb.server.credential;
  if (!cred || cred.authType !== "PASSWORD") {
    throw new Error("需要服务器凭据（用户名/密码）以连接 LDAP");
  }
  const password = YOUR_PASSWORD);
  const bindDN = parseConfig(rb.configJson).bindDN?.trim() || cred.username?.trim();
  if (!bindDN) throw new Error("请配置 bindDN 或凭据用户名（完整 LDAP 绑定 DN）");
  const cfg = parseConfig(rb.configJson);
  const url = buildLdapUrl(rb.server.host, cfg);
  return { rb, cfg, url, bindDN, password, host: rb.server.host };
}

export async function adTestConnection(serverId: string, roleBindingId: string): Promise<{ ok: boolean; message: string }> {
  let client: Client | null = null;
  try {
    const { url, bindDN, password, cfg } = await getAdContext(serverId, roleBindingId);
    const { timeout, connectTimeout } = await getLdapClientTimeouts();
    client = new Client({
      url,
      timeout: Math.min(timeout, 30000),
      connectTimeout,
      strictDN: false,
      ...(url.startsWith("ldaps://") && {
        tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized !== false },
      }),
    });
    await client.bind(bindDN, password);
    await client.search(cfg.baseDN, { scope: "base", filter: "(objectClass=*)", sizeLimit: 1 });
    await client.unbind();
    return { ok: true, message: "LDAP 连接与绑定成功" };
  } catch (e) {
    try {
      await client?.unbind();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export type OuEntry = { dn: string; name: string };

export async function adListOus(serverId: string, roleBindingId: string): Promise<OuEntry[]> {
  const { cfg, url, bindDN, password } = await getAdContext(serverId, roleBindingId);
  const { timeout, connectTimeout } = await getLdapClientTimeouts();
  const client = new Client({
    url,
    timeout,
    connectTimeout,
    strictDN: false,
    ...(url.startsWith("ldaps://") && {
      tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized !== false },
    }),
  });
  try {
    await client.bind(bindDN, password);
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: "sub",
      filter: "(|(objectClass=organizationalUnit)(objectCategory=organizationalUnit))",
      attributes: ["cn", "name", "ou"],
      sizeLimit: 500,
    });
    return searchEntries.map((e) => {
      const name = entryAttr(e, "cn") || entryAttr(e, "name") || entryAttr(e, "ou") || e.dn;
      return { dn: e.dn, name };
    });
  } finally {
    await client.unbind().catch(() => {});
  }
}

export type AdUserEntry = { dn: string; sAMAccountName: string; displayName: string };

export async function adSearchUsers(
  serverId: string,
  roleBindingId: string,
  query: string | undefined,
  take: number,
): Promise<AdUserEntry[]> {
  const { cfg, url, bindDN, password } = await getAdContext(serverId, roleBindingId);
  const { timeout, connectTimeout } = await getLdapClientTimeouts();
  const client = new Client({
    url,
    timeout,
    connectTimeout,
    strictDN: false,
    ...(url.startsWith("ldaps://") && {
      tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized !== false },
    }),
  });
  const q = (query ?? "").trim();
  const filter =
    q.length > 0
      ? `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*${escapeLdap(q)}*)(displayName=*${escapeLdap(q)}*)))`
      : "(&(objectCategory=person)(objectClass=user))";
  try {
    await client.bind(bindDN, password);
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: "sub",
      filter,
      attributes: ["sAMAccountName", "displayName"],
      sizeLimit: Math.min(Math.max(take, 1), 200),
    });
    return searchEntries.map((e) => ({
      dn: e.dn,
      sAMAccountName: entryAttr(e, "sAMAccountName"),
      displayName: entryAttr(e, "displayName") || entryAttr(e, "sAMAccountName"),
    }));
  } finally {
    await client.unbind().catch(() => {});
  }
}

export async function adListUsersInOu(
  serverId: string,
  roleBindingId: string,
  ouDn: string,
  take: number,
): Promise<AdUserEntry[]> {
  const { cfg, url, bindDN, password } = await getAdContext(serverId, roleBindingId);
  const { timeout, connectTimeout } = await getLdapClientTimeouts();
  const client = new Client({
    url,
    timeout,
    connectTimeout,
    strictDN: false,
    ...(url.startsWith("ldaps://") && {
      tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized !== false },
    }),
  });

  const baseDn = (ouDn ?? "").trim();
  if (!baseDn) throw new Error("ouDn 不能为空");
  assertDnUnderBase(baseDn, cfg.baseDN);

  const filter = "(&(objectCategory=person)(objectClass=user))";
  try {
    await client.bind(bindDN, password);
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub",
      filter,
      attributes: ["sAMAccountName", "displayName"],
      sizeLimit: Math.min(Math.max(take, 1), 200),
    });
    return searchEntries.map((e) => ({
      dn: e.dn,
      sAMAccountName: entryAttr(e, "sAMAccountName"),
      displayName: entryAttr(e, "displayName") || entryAttr(e, "sAMAccountName"),
    }));
  } finally {
    await client.unbind().catch(() => {});
  }
}

function escapeLdap(s: string): string {
  return s.replace(/[*()\\\0]/g, (c) => "\\" + c.charCodeAt(0).toString(16));
}

export type AdGroupEntry = { dn: string; name: string; sAMAccountName: string };

export async function adSearchGroups(
  serverId: string,
  roleBindingId: string,
  query: string | undefined,
  take: number,
): Promise<AdGroupEntry[]> {
  const q = (query ?? "").trim();
  const filter =
    q.length > 0
      ? `(&(objectCategory=group)(objectClass=group)(|(cn=*${escapeLdap(q)}*)(sAMAccountName=*${escapeLdap(q)}*)))`
      : "(&(objectCategory=group)(objectClass=group))";
  return withAdClient(serverId, roleBindingId, async (client, cfg) => {
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: "sub",
      filter,
      attributes: ["cn", "sAMAccountName"],
      sizeLimit: Math.min(Math.max(take, 1), 200),
    });
    return searchEntries.map((e) => ({
      dn: e.dn,
      name: entryAttr(e, "cn") || entryAttr(e, "sAMAccountName") || e.dn,
      sAMAccountName: entryAttr(e, "sAMAccountName"),
    }));
  });
}

export type AdWriteRequest =
  | { action: "createOu"; parentDn: string; name: string }
  | { action: "deleteEntry"; dn: string }
  | {
      action: "createUser";
      parentDn: string;
      sAMAccountName: string;
      cn: string;
      displayName?: string;
      password?: string;
    }
  | {
      action: "modifyUser";
      dn: string;
      displayName?: string;
      description?: string | null;
      userAccountControl?: string;
    }
  | { action: "setPassword"; dn: string; password: YOUR_PASSWORD }
  | { action: "addMemberToGroup"; groupDn: string; memberDn: string }
  | { action: "removeMemberFromGroup"; groupDn: string; memberDn: string };

export async function adExecuteWrite(
  serverId: string,
  roleBindingId: string,
  req: AdWriteRequest,
): Promise<{ ok: true; message: string; dn?: string }> {
  return withAdClient(serverId, roleBindingId, async (client, cfg, ldapUrl) => {
    switch (req.action) {
      case "createOu": {
        assertSafeRdnSegment(req.name, "OU 名称");
        assertDnUnderBase(req.parentDn, cfg.baseDN);
        const ouDn = `OU=${req.name},${req.parentDn}`;
        assertDnUnderBase(ouDn, cfg.baseDN);
        await client.add(ouDn, {
          objectClass: ["top", "organizationalUnit"],
          ou: req.name,
          name: req.name,
        });
        return { ok: true, message: `已创建 OU：${ouDn}`, dn: ouDn };
      }
      case "deleteEntry": {
        assertDnUnderBase(req.dn, cfg.baseDN);
        await client.del(req.dn);
        return { ok: true, message: `已删除：${req.dn}`, dn: req.dn };
      }
      case "createUser": {
        assertSafeRdnSegment(req.cn, "CN");
        assertSafeRdnSegment(req.sAMAccountName, "sAMAccountName");
        assertDnUnderBase(req.parentDn, cfg.baseDN);
        const userDn = `CN=${req.cn},${req.parentDn}`;
        assertDnUnderBase(userDn, cfg.baseDN);
        await client.add(userDn, {
          objectClass: ["top", "person", "organizationalPerson", "user"],
          cn: req.cn,
          sAMAccountName: req.sAMAccountName,
          userAccountControl: "514",
          ...(req.displayName?.trim() ? { displayName: req.displayName.trim() } : {}),
        });
        if (req.password?.length) {
          if (!ldapUrl.startsWith("ldaps://")) {
            throw new Error("为用户设置初始密码需要 LDAPS（请在 configJson 中配置 ldaps://…:636）");
          }
          await setUnicodePassword(client, userDn, req.password);
          await client.modify(userDn, [
            new Change({
              operation: "replace",
              modification: new Attribute({ type: "userAccountControl", values: ["512"] }),
            }),
          ]);
          return { ok: true, message: `已创建用户（已设密码并启用）：${userDn}`, dn: userDn };
        }
        return { ok: true, message: `已创建用户（禁用状态 514，未设密码）：${userDn}`, dn: userDn };
      }
      case "modifyUser": {
        assertDnUnderBase(req.dn, cfg.baseDN);
        const changes: Change[] = [];
        if (req.displayName !== undefined) {
          changes.push(
            new Change({
              operation: "replace",
              modification: new Attribute({ type: "displayName", values: [req.displayName] }),
            }),
          );
        }
        if (req.description !== undefined && req.description !== null) {
          changes.push(
            new Change({
              operation: "replace",
              modification: new Attribute({ type: "description", values: [req.description] }),
            }),
          );
        }
        if (req.userAccountControl?.length) {
          changes.push(
            new Change({
              operation: "replace",
              modification: new Attribute({ type: "userAccountControl", values: [req.userAccountControl] }),
            }),
          );
        }
        if (!changes.length) throw new Error("未提供要修改的属性");
        await client.modify(req.dn, changes);
        return { ok: true, message: `已更新：${req.dn}`, dn: req.dn };
      }
      case "setPassword": {
        assertDnUnderBase(req.dn, cfg.baseDN);
        if (!ldapUrl.startsWith("ldaps://")) {
          throw new Error("修改密码必须使用 LDAPS（ldaps://…:636）");
        }
        await setUnicodePassword(client, req.dn, req.password);
        return { ok: true, message: `已更新密码：${req.dn}`, dn: req.dn };
      }
      case "addMemberToGroup": {
        assertDnUnderBase(req.groupDn, cfg.baseDN);
        assertDnUnderBase(req.memberDn, cfg.baseDN);
        await client.modify(req.groupDn, [
          new Change({
            operation: "add",
            modification: new Attribute({ type: "member", values: [req.memberDn] }),
          }),
        ]);
        return { ok: true, message: `已加入组：${req.memberDn} → ${req.groupDn}`, dn: req.groupDn };
      }
      case "removeMemberFromGroup": {
        assertDnUnderBase(req.groupDn, cfg.baseDN);
        assertDnUnderBase(req.memberDn, cfg.baseDN);
        await client.modify(req.groupDn, [
          new Change({
            operation: "delete",
            modification: new Attribute({ type: "member", values: [req.memberDn] }),
          }),
        ]);
        return { ok: true, message: `已从组移除：${req.memberDn}`, dn: req.groupDn };
      }
      default: {
        const _exhaustive: never = req;
        return _exhaustive;
      }
    }
  });
}

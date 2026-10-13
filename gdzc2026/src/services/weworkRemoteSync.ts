import type { WeChatDeptPayload, WeChatUserPayload } from "./wxSyncService.js";
import {
  getWeworkCorpId,
  getWeworkCorpSecret,
  getWeworkRootDeptId,
} from "./runtimeSettingsService.js";
import { syncDepartments, syncUsers } from "./wxSyncService.js";

export { isWeworkRemoteConfigured } from "./runtimeSettingsService.js";

type TokenResp = { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
type DeptListResp = {
  errcode?: number;
  errmsg?: string;
  department?: {
    id: number;
    name: string;
    parentid: number;
    order?: number;
  }[];
};

type DeptSimpleListResp = {
  errcode?: number;
  errmsg?: string;
  department_id?: {
    id: number;
    parentid: number;
    order?: number;
  }[];
};
type UserListResp = {
  errcode?: number;
  errmsg?: string;
  userlist?: {
    userid: string;
    name: string;
    department?: number[];
    mobile?: string;
    email?: string;
    position?: string;
    status?: number;
  }[];
};

type UserListIdResp = {
  errcode?: number;
  errmsg?: string;
  next_cursor?: string;
  dept_user?: {
    userid: string;
    department: number;
  }[];
};

let tokenCache: { token: YOUR_SECRET; expiresAtMs: number; sig: string } | null = null;

async function getAccessToken(): Promise<string> {
  const corpId = await getWeworkCorpId();
  const secret = await getWeworkCorpSecret();
  if (!corpId || !secret) {
    throw new Error("未配置企业微信 corpid/secret（参数设置或环境变量 WEWORK_*）");
  }
  const sig = `${corpId}:${secret.slice(0, 8)}`;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000 && tokenCache.sig === sig) {
    return tokenCache.token;
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`;
  const r = await fetch(url);
  const j = (await r.json()) as TokenResp;
  if (j.errcode !== 0 || !j.access_token) {
    throw new Error(j.errmsg ?? `gettoken 失败 errcode=${j.errcode}`);
  }
  const ttlSec = j.expires_in ?? 7200;
  tokenCache = { token: YOUR_SECRET, expiresAtMs: now + ttlSec * 1000, sig };
  return j.access_token;
}

function mapDept(d: NonNullable<DeptListResp["department"]>[number]): WeChatDeptPayload {
  return {
    id: String(d.id),
    name: d.name,
    parentid: d.parentid === 0 ? "0" : d.parentid,
    order: d.order ?? 0,
  };
}

function mapDeptSimple(
  d: NonNullable<DeptSimpleListResp["department_id"]>[number],
): WeChatDeptPayload {
  // department/simplelist 仅返回部门ID、父ID、排序，无部门名称。
  // 为保证同步流程可跑通，这里先用“部门ID”占位名称。
  const idStr = String(d.id);
  return {
    id: idStr,
    name: `部门${idStr}`,
    parentid: d.parentid === 0 ? "0" : d.parentid,
    order: d.order ?? 0,
  };
}

function sortDepartmentsParentFirst(depts: WeChatDeptPayload[]): WeChatDeptPayload[] {
  const idSet = new Set(depts.map((d) => String(d.id)));
  const byId = new Map(depts.map((d) => [String(d.id), d] as const));
  const memo = new Map<string, number>();
  function depthOf(id: string, visiting: Set<string>): number {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) {
      memo.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const d = byId.get(id);
    if (!d) {
      memo.set(id, 0);
      return 0;
    }
    const raw = d.parentid;
    const pid =
      raw === undefined || raw === 0 || raw === "0" ? null : String(raw);
    if (!pid || !idSet.has(pid)) {
      memo.set(id, 0);
      return 0;
    }
    const v = depthOf(pid, visiting) + 1;
    memo.set(id, v);
    return v;
  }
  return [...depts].sort(
    (a, b) => depthOf(String(a.id), new Set()) - depthOf(String(b.id), new Set()),
  );
}

function mapUser(u: NonNullable<UserListResp["userlist"]>[number]): WeChatUserPayload {
  const department = Array.isArray(u.department) ? u.department : [];
  return {
    userid: u.userid,
    name: u.name,
    department,
    mobile: u.mobile,
    email: u.email,
    position: u.position,
    status: u.status,
  };
}

async function fetchDepartmentList(token: YOUR_SECRET): Promise<WeChatDeptPayload[]> {
  const urlList = `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=YOUR_SECRET)}`;
  const r = await fetch(urlList);
  const j = (await r.json()) as DeptListResp;
  if (j.errcode === 0) {
    const list = j.department ?? [];
    return list.map(mapDept);
  }

  // 48009: api forbidden for contact assistant
  // department/simplelist 仍可获取部门ID树（但没有名称），我们用“部门ID占位名称”继续同步。
  const errMsg = j.errmsg ?? "";
  const errCode = j.errcode ?? -1;
  const shouldFallback =
    errCode === 48009 || /contact assistant/i.test(errMsg) || /forbidden/i.test(errMsg);
  if (!shouldFallback) {
    throw new Error(j.errmsg ?? `department/list errcode=${j.errcode}`);
  }

  const urlSimple =
    `https://qyapi.weixin.qq.com/cgi-bin/department/simplelist?access_token=YOUR_SECRET)}`;
  const r2 = await fetch(urlSimple);
  const j2 = (await r2.json()) as DeptSimpleListResp;
  if (j2.errcode !== 0) {
    throw new Error(j2.errmsg ?? `department/simplelist errcode=${j2.errcode}`);
  }
  const list = j2.department_id ?? [];
  return list.map(mapDeptSimple);
}

async function fetchAllUsersByListId(token: YOUR_SECRET): Promise<WeChatUserPayload[]> {
  const byUserid = new Map<string, number[]>();

  // 方案A：通讯录同步secret -> user/list_id（官方建议）
  const limit = 1000;
  let cursor: string | undefined;
  let listIdReady = true;
  for (;;) {
    const params = new URLSearchParams({
      access_token: YOUR_SECRET,
      limit: String(limit),
    });
    if (cursor) params.set("cursor", cursor);
    const url = `https://qyapi.weixin.qq.com/cgi-bin/user/list_id?${params.toString()}`;
    const r = await fetch(url);
    const j = (await r.json()) as UserListIdResp;
    if (j.errcode !== 0) {
      const e = j.errcode ?? -1;
      // list_id 只支持通讯录同步secret；应用secret通常会 48002
      if (e === 48002 || e === 48009 || /forbidden/i.test(j.errmsg ?? "")) {
        listIdReady = false;
        byUserid.clear();
        break;
      }
      throw new Error(j.errmsg ?? `user/list_id errcode=${j.errcode}`);
    }

    for (const info of j.dept_user ?? []) {
      const userid = info.userid;
      if (!byUserid.has(userid)) byUserid.set(userid, []);
      if (info.department) byUserid.get(userid)!.push(info.department);
    }

    const next = j.next_cursor?.trim();
    if (!next) break;
    cursor = next;
  }

  // 方案B：应用secret -> 先按部门 user/list 拿 userid，再逐个 user/get
  if (!listIdReady) {
    const depts = await fetchDepartmentList(token);
    const rootDeptId = await getWeworkRootDeptId();
    const rootIdNum = Number(rootDeptId || "1");
    const deptIds = depts.length
      ? depts.map((d) => Number(d.id)).filter((x) => Number.isFinite(x))
      : [rootIdNum];
    const seenDept = new Set<number>();
    for (const deptId of deptIds) {
      if (seenDept.has(deptId)) continue;
      seenDept.add(deptId);
      const params = new URLSearchParams({
        access_token: YOUR_SECRET,
        department_id: String(deptId),
      });
      const url = `https://qyapi.weixin.qq.com/cgi-bin/user/list?${params.toString()}`;
      const r = await fetch(url);
      const j = (await r.json()) as UserListResp;
      if (j.errcode !== 0) {
        throw new Error(j.errmsg ?? `user/list errcode=${j.errcode}, dept=${deptId}`);
      }
      for (const u of j.userlist ?? []) {
        if (!u.userid) continue;
        if (!byUserid.has(u.userid)) byUserid.set(u.userid, []);
        for (const d of Array.isArray(u.department) ? u.department : [deptId]) {
          if (Number.isFinite(Number(d))) byUserid.get(u.userid)!.push(Number(d));
        }
      }
    }
  }

  // 按要求：逐个调用 user/get 获取成员详情（姓名等）
  const users: WeChatUserPayload[] = [];
  for (const [userid, deptIds] of byUserid.entries()) {
    const params = new URLSearchParams({
      access_token: YOUR_SECRET,
      userid,
    });
    const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?${params.toString()}`;
    const r = await fetch(url);
    const j = (await r.json()) as any;
    if (j?.errcode !== 0) {
      throw new Error(j?.errmsg ?? `user/get errcode=${j?.errcode}, userid=${userid}`);
    }
    const fromGet = Array.isArray(j?.department)
      ? j.department.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x))
      : [];
    const departments = fromGet.length ? fromGet : [...new Set(deptIds)];
    users.push({
      userid,
      name: typeof j?.name === "string" && j.name.trim() ? j.name.trim() : userid,
      department: departments,
      mobile: typeof j?.mobile === "string" ? j.mobile : undefined,
      email: typeof j?.email === "string" ? j.email : undefined,
      position: typeof j?.position === "string" ? j.position : undefined,
      status: typeof j?.status === "number" ? j.status : undefined,
    });
  }
  return users;
}

/**
 * 从企业微信通讯录 API 拉取部门与成员并写入本地镜像（需 WEWORK_CORP_ID + WEWORK_CORP_SECRET）。
 * 使用通讯录同步 Secret 或具备通讯录只读权限的应用 Secret。
 */
export async function pullRemoteWxSync(): Promise<{
  departments: { upserted: number };
  users: { upserted: number };
}> {
  const token = YOUR_SECRET getAccessToken();
  const deptPayloads = sortDepartmentsParentFirst(await fetchDepartmentList(token));
  const deptResult = await syncDepartments(deptPayloads);
  const userPayloads = await fetchAllUsersByListId(token);
  const userResult = await syncUsers(userPayloads);

  return { departments: deptResult, users: userResult };
}

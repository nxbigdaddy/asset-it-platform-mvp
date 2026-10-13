import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";
import { touchSyncJob } from "./syncJobStateService.js";

export type WeChatDeptPayload = {
  id: string;
  name: string;
  parentid?: number | string;
  order?: number;
};

export type WeChatUserPayload = {
  userid: string;
  name: string;
  department: number[];
  mobile?: string;
  email?: string;
  position?: string;
  status?: number;
};

function idSetFromDepts(depts: WeChatDeptPayload[]): Set<string> {
  return new Set(depts.map((d) => String(d.id)));
}

/** 父部门 id：企微根为 0；若父不在本批次列表中则置空，避免 FK 失败 */
function resolveParentId(d: WeChatDeptPayload, idSet: Set<string>): string | null {
  const raw =
    d.parentid === undefined || d.parentid === 0 || d.parentid === "0"
      ? null
      : String(d.parentid);
  if (!raw || !idSet.has(raw)) return null;
  return raw;
}

function depthForSort(
  id: string,
  byId: Map<string, WeChatDeptPayload>,
  idSet: Set<string>,
  memo: Map<string, number>,
  stack: Set<string>,
): number {
  if (memo.has(id)) return memo.get(id)!;
  if (stack.has(id)) {
    memo.set(id, 0);
    return 0;
  }
  const d = byId.get(id);
  if (!d) {
    memo.set(id, 0);
    return 0;
  }
  const p = resolveParentId(d, idSet);
  if (!p) {
    memo.set(id, 0);
    return 0;
  }
  stack.add(id);
  const dep = depthForSort(p, byId, idSet, memo, stack) + 1;
  stack.delete(id);
  memo.set(id, dep);
  return dep;
}

/**
 * 将企业微信部门列表写入镜像表（全量或增量由调用方决定；此处按 id upsert）
 * 分两阶段：先确保所有 id 落库（parentId 暂空），再按深度升序更新 parentId，避免父行未存在时违反外键。
 */
export async function syncDepartments(depts: WeChatDeptPayload[]): Promise<{ upserted: number }> {
  try {
  const idSet = idSetFromDepts(depts);
  const byId = new Map(depts.map((d) => [String(d.id), d] as const));
  let n = 0;
  const now = new Date();

  for (const d of depts) {
    const existing = await prisma.wxDepartment.findUnique({
      where: { id: String(d.id) },
      select: { name: true },
    });
    const incomingName = (d.name ?? "").trim();
    const incomingLooksPlaceholder = /^部门\d+$/.test(incomingName);
    const existingName = existing?.name?.trim() ?? "";
    const existingLooksPlaceholder = /^部门\d+$/.test(existingName);
    // simplelist 场景会回落到“部门{id}”占位名；如果库里已有中文名，优先保留中文名不被覆盖。
    const finalName =
      incomingLooksPlaceholder && existingName && !existingLooksPlaceholder
        ? existingName
        : (incomingName || existingName || `部门${String(d.id)}`);

    await prisma.wxDepartment.upsert({
      where: { id: String(d.id) },
      create: {
        id: String(d.id),
        name: finalName,
        parentId: null,
        order: d.order ?? 0,
        lastSyncAt: now,
      },
      update: {
        name: finalName,
        order: d.order ?? 0,
        lastSyncAt: now,
      },
    });
    n++;
  }

  const memo = new Map<string, number>();
  for (const d of depts) {
    depthForSort(String(d.id), byId, idSet, memo, new Set());
  }
  const sorted = [...depts].sort(
    (a, b) => (memo.get(String(a.id)) ?? 0) - (memo.get(String(b.id)) ?? 0),
  );

  for (const d of sorted) {
    const parentId = resolveParentId(d, idSet);
    await prisma.wxDepartment.update({
      where: { id: String(d.id) },
      data: { parentId },
    });
  }
  await writeAudit("WxSync", "department", "SYNC", { count: n });
  await touchSyncJob("wx-department-sync", { ok: true });
  return { upserted: n };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await touchSyncJob("wx-department-sync", { ok: false, error: msg });
    throw e;
  }
}

/**
 * 同步成员：更新 WxUser 与 WxUserDepartment
 */
export async function syncUsers(users: WeChatUserPayload[]): Promise<{ upserted: number }> {
  try {
  let n = 0;
  const now = new Date();
  for (const u of users) {
    const active = u.status === undefined || u.status === 1;
    const existing = await prisma.wxUser.findUnique({
      where: { userid: u.userid },
      select: { name: true },
    });
    // list_id 场景下拿到的 name 往往只是 userid；此时保留库内已有中文姓名，避免被英文账号覆盖。
    const incomingName = (u.name ?? "").trim();
    const shouldUseIncomingName = incomingName.length > 0 && incomingName !== u.userid;
    const finalName = shouldUseIncomingName
      ? incomingName
      : (existing?.name?.trim() || u.userid);
    const row = await prisma.wxUser.upsert({
      where: { userid: u.userid },
      create: {
        userid: u.userid,
        name: finalName,
        mobile: u.mobile,
        email: u.email,
        position: u.position,
        active,
        lastSyncAt: now,
      },
      update: {
        name: finalName,
        mobile: u.mobile,
        email: u.email,
        position: u.position,
        active,
        lastSyncAt: now,
      },
    });

    await prisma.wxUserDepartment.deleteMany({ where: { userId: row.id } });
    let ord = 0;
    for (const depId of u.department) {
      await prisma.wxUserDepartment.create({
        data: {
          userId: row.id,
          departmentId: String(depId),
          order: ord++,
        },
      });
    }
    n++;
  }
  await writeAudit("WxSync", "user", "SYNC", { count: n });
  await touchSyncJob("wx-user-sync", { ok: true });
  return { upserted: n };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await touchSyncJob("wx-user-sync", { ok: false, error: msg });
    throw e;
  }
}

/**
 * 检测离职用户并返回仍 ACTIVE 的分配（供回收流程）
 */
export async function findAssignmentsForDepartedUsers(): Promise<
  { userid: string; name: string; assignments: { assetId: string; assetNo: string }[] }[]
> {
  const inactive = await prisma.wxUser.findMany({ where: { active: false } });
  const result: {
    userid: string;
    name: string;
    assignments: { assetId: string; assetNo: string }[];
  }[] = [];

  for (const u of inactive) {
    const assigns = await prisma.assetAssignment.findMany({
      where: { wxUserId: u.id, status: "ACTIVE" },
      include: { asset: { select: { id: true, assetNo: true } } },
    });
    if (assigns.length === 0) continue;
    result.push({
      userid: u.userid,
      name: u.name,
      assignments: assigns.map((a) => ({
        assetId: a.asset.id,
        assetNo: a.asset.assetNo,
      })),
    });
  }
  return result;
}

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/** null = 不按组织过滤；[] = 无可见资产 */
export async function getOrgScopeIdsForUser(userId: string): Promise<string[] | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.role === "admin") return null;
  const raw = u.orgScopeJson?.trim();
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function assetWhereForOrgScope(orgUnitIds: string[] | null): Prisma.AssetWhereInput {
  if (orgUnitIds === null) return {};
  if (orgUnitIds.length === 0) return { id: { in: [] } };
  return { orgUnitId: { in: orgUnitIds } };
}

export async function assertUserCanViewAsset(userId: string, assetOrgUnitId: string | null): Promise<void> {
  const scope = await getOrgScopeIdsForUser(userId);
  if (scope === null) return;
  if (scope.length === 0) throw new Error("无数据权限");
  if (!assetOrgUnitId || !scope.includes(assetOrgUnitId)) {
    throw new Error("无权查看该资产（组织范围限制）");
  }
}

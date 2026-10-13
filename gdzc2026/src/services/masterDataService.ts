import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function createCategory(input: {
  code: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  typeCode?: string | null;
  actor?: string;
}) {
  const row = await prisma.assetCategory.create({
    data: {
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? undefined,
      sortOrder: input.sortOrder ?? 0,
      typeCode: input.typeCode ?? undefined,
    },
  });
  await writeAudit("AssetCategory", row.id, "CREATE", { code: row.code }, input.actor);
  return row;
}

export async function updateCategory(
  id: string,
  input: { name?: string; sortOrder?: number; typeCode?: string | null; parentId?: string | null },
  actor?: string,
) {
  const row = await prisma.assetCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.typeCode !== undefined && { typeCode: input.typeCode ?? undefined }),
      ...(input.parentId !== undefined && { parentId: input.parentId ?? undefined }),
    },
  });
  await writeAudit("AssetCategory", id, "UPDATE", input, actor);
  return row;
}

export async function deleteCategory(id: string, actor?: string) {
  const childCount = await prisma.assetCategory.count({ where: { parentId: id } });
  if (childCount > 0) throw new Error("存在子分类，无法删除");
  const assetCount = await prisma.asset.count({ where: { categoryId: id } });
  if (assetCount > 0) throw new Error("分类下仍有资产，无法删除");
  await prisma.assetCategory.delete({ where: { id } });
  await writeAudit("AssetCategory", id, "DELETE", {}, actor);
}

export async function createLocation(input: {
  code: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  actor?: string;
}) {
  const row = await prisma.location.create({
    data: {
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? undefined,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAudit("Location", row.id, "CREATE", { code: row.code }, input.actor);
  return row;
}

export async function updateLocation(
  id: string,
  input: { name?: string; sortOrder?: number; parentId?: string | null },
  actor?: string,
) {
  const row = await prisma.location.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.parentId !== undefined && { parentId: input.parentId ?? undefined }),
    },
  });
  await writeAudit("Location", id, "UPDATE", input, actor);
  return row;
}

export async function deleteLocation(id: string, actor?: string) {
  const childCount = await prisma.location.count({ where: { parentId: id } });
  if (childCount > 0) throw new Error("存在子位置，无法删除");
  const assetCount = await prisma.asset.count({ where: { locationId: id } });
  if (assetCount > 0) throw new Error("位置下仍有资产，无法删除");
  await prisma.location.delete({ where: { id } });
  await writeAudit("Location", id, "DELETE", {}, actor);
}

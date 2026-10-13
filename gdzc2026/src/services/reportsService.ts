import { prisma } from "../lib/prisma.js";

export async function assetSummaryReport() {
  const byStatus = await prisma.asset.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const byCategory = await prisma.asset.groupBy({
    by: ["categoryId"],
    _count: { id: true },
  });
  const categories = await prisma.assetCategory.findMany({
    where: { id: { in: byCategory.map((x) => x.categoryId) } },
  });
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const valueAgg = await prisma.asset.aggregate({
    _sum: { originalValue: true },
    where: { originalValue: { not: null } },
  });

  return {
    byStatus: byStatus.map((x) => ({ status: x.status, count: x._count.id })),
    byCategory: byCategory.map((x) => ({
      categoryId: x.categoryId,
      categoryName: catMap.get(x.categoryId) ?? x.categoryId,
      count: x._count.id,
    })),
    totalOriginalValue: valueAgg._sum.originalValue?.toString() ?? "0",
  };
}

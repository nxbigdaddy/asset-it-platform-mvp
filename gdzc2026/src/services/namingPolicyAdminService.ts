import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function createNamingPolicy(input: {
  name: string;
  template: string;
  scopeType: string;
  categoryId?: string | null;
  siteCode?: string | null;
  isDefault?: boolean;
  actor?: string;
}) {
  const row = await prisma.namingPolicy.create({
    data: {
      name: input.name,
      template: input.template,
      scopeType: input.scopeType,
      categoryId: input.categoryId ?? undefined,
      siteCode: input.siteCode ?? undefined,
      isDefault: input.isDefault ?? false,
    },
  });
  await writeAudit("NamingPolicy", row.id, "CREATE", { name: row.name }, input.actor);
  return row;
}

export async function updateNamingPolicy(
  id: string,
  input: {
    name?: string;
    template?: string;
    scopeType?: string;
    categoryId?: string | null;
    siteCode?: string | null;
    isDefault?: boolean;
  },
  actor?: string,
) {
  const row = await prisma.namingPolicy.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.template !== undefined && { template: input.template }),
      ...(input.scopeType !== undefined && { scopeType: input.scopeType }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId ?? undefined }),
      ...(input.siteCode !== undefined && { siteCode: input.siteCode ?? undefined }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
    },
  });
  await writeAudit("NamingPolicy", id, "UPDATE", input, actor);
  return row;
}

export async function deleteNamingPolicy(id: string, actor?: string) {
  const used = await prisma.asset.count({ where: { namingPolicyId: id } });
  if (used > 0) throw new Error("策略仍被资产引用，无法删除");
  await prisma.namingSequence.deleteMany({ where: { policyId: id } });
  await prisma.namingPolicy.delete({ where: { id } });
  await writeAudit("NamingPolicy", id, "DELETE", {}, actor);
}

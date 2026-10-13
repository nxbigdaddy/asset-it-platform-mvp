import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function listSettings() {
  return prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
}

export async function getSettingValue(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function upsertSetting(key: string, value: string, note?: string | null, actor?: string) {
  const row = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, note: note ?? undefined },
    update: { value, ...(note !== undefined && { note: note ?? undefined }) },
  });
  await writeAudit("SystemSetting", key, "UPSERT", { value }, actor);
  return row;
}

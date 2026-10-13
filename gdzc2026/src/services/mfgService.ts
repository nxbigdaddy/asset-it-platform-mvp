import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function listMolds() {
  return prisma.moldAsset.findMany({
    orderBy: { updatedAt: "desc" },
    include: { asset: { select: { id: true, assetNo: true, name: true } } },
  });
}

export async function upsertMold(input: {
  id?: string;
  assetId: string;
  moldCode: string;
  maxLife?: number;
  usedCount?: number;
  note?: string | null;
  actor?: string;
}) {
  if (input.id) {
    const row = await prisma.moldAsset.update({
      where: { id: input.id },
      data: {
        moldCode: input.moldCode,
        maxLife: input.maxLife ?? 0,
        usedCount: input.usedCount ?? 0,
        note: input.note ?? undefined,
      },
      include: { asset: true },
    });
    await writeAudit("MoldAsset", row.id, "UPDATE", { moldCode: row.moldCode }, input.actor);
    return row;
  }
  const row = await prisma.moldAsset.create({
    data: {
      assetId: input.assetId,
      moldCode: input.moldCode,
      maxLife: input.maxLife ?? 0,
      usedCount: input.usedCount ?? 0,
      note: input.note ?? undefined,
    },
    include: { asset: true },
  });
  await writeAudit("MoldAsset", row.id, "CREATE", { moldCode: row.moldCode }, input.actor);
  return row;
}

export async function listMaintenance() {
  return prisma.maintenanceRecord.findMany({
    orderBy: { nextDue: "asc" },
    include: { asset: { select: { id: true, assetNo: true, name: true } } },
  });
}

export async function upsertMaintenance(input: {
  id?: string;
  assetId: string;
  nextDue?: Date | null;
  lastService?: Date | null;
  note?: string | null;
  actor?: string;
}) {
  if (input.id) {
    const row = await prisma.maintenanceRecord.update({
      where: { id: input.id },
      data: {
        nextDue: input.nextDue ?? undefined,
        lastService: input.lastService ?? undefined,
        note: input.note ?? undefined,
      },
      include: { asset: true },
    });
    await writeAudit("MaintenanceRecord", row.id, "UPDATE", {}, input.actor);
    return row;
  }
  const row = await prisma.maintenanceRecord.create({
    data: {
      assetId: input.assetId,
      nextDue: input.nextDue ?? undefined,
      lastService: input.lastService ?? undefined,
      note: input.note ?? undefined,
    },
    include: { asset: true },
  });
  await writeAudit("MaintenanceRecord", row.id, "CREATE", { assetId: input.assetId }, input.actor);
  return row;
}

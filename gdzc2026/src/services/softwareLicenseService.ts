import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function listSoftwareLicenses() {
  return prisma.softwareLicense.findMany({
    orderBy: { createdAt: "desc" },
    include: { asset: { select: { id: true, assetNo: true, name: true } } },
  });
}

export async function createSoftwareLicense(input: {
  name: string;
  vendor?: string | null;
  totalSeats?: number;
  usedSeats?: number;
  expireAt?: Date | null;
  assetId?: string | null;
  note?: string | null;
  actor?: string;
}) {
  const row = await prisma.softwareLicense.create({
    data: {
      name: input.name,
      vendor: input.vendor ?? undefined,
      totalSeats: input.totalSeats ?? 0,
      usedSeats: input.usedSeats ?? 0,
      expireAt: input.expireAt ?? undefined,
      assetId: input.assetId ?? undefined,
      note: input.note ?? undefined,
    },
  });
  await writeAudit("SoftwareLicense", row.id, "CREATE", { name: row.name }, input.actor);
  return row;
}

export async function updateSoftwareLicense(
  id: string,
  input: {
    name?: string;
    vendor?: string | null;
    totalSeats?: number;
    usedSeats?: number;
    expireAt?: Date | null;
    assetId?: string | null;
    note?: string | null;
  },
  actor?: string,
) {
  const row = await prisma.softwareLicense.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.vendor !== undefined && { vendor: input.vendor ?? undefined }),
      ...(input.totalSeats !== undefined && { totalSeats: input.totalSeats }),
      ...(input.usedSeats !== undefined && { usedSeats: input.usedSeats }),
      ...(input.expireAt !== undefined && { expireAt: input.expireAt ?? undefined }),
      ...(input.assetId !== undefined && { assetId: input.assetId ?? undefined }),
      ...(input.note !== undefined && { note: input.note ?? undefined }),
    },
  });
  await writeAudit("SoftwareLicense", id, "UPDATE", input, actor);
  return row;
}

export async function deleteSoftwareLicense(id: string, actor?: string) {
  await prisma.softwareLicense.delete({ where: { id } });
  await writeAudit("SoftwareLicense", id, "DELETE", {}, actor);
}

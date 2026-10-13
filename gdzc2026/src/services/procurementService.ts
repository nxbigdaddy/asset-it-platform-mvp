import { prisma } from "../lib/prisma.js";
import { nextOrderNo } from "../lib/orderNo.js";
import { writeAudit } from "./auditService.js";

export async function listProcurementRequests(take = 100) {
  return prisma.procurementRequest.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      asset: { select: { id: true, assetNo: true, name: true } },
    },
  });
}

export async function createProcurementRequest(input: {
  title: string;
  expectedAmount?: string | null;
  remark?: string | null;
  relatedAssetId?: string | null;
  actor?: string;
}) {
  const row = await prisma.procurementRequest.create({
    data: {
      requestNo: nextOrderNo("PR"),
      title: input.title,
      expectedAmount: input.expectedAmount ?? undefined,
      remark: input.remark ?? undefined,
      relatedAssetId: input.relatedAssetId ?? undefined,
      status: "PENDING_ACCEPTANCE",
    },
  });
  await writeAudit("ProcurementRequest", row.id, "CREATE", { requestNo: row.requestNo }, input.actor);
  return row;
}

export async function updateProcurementStatus(
  id: string,
  status: string,
  actor?: string,
) {
  const row = await prisma.procurementRequest.update({
    where: { id },
    data: { status },
  });
  await writeAudit("ProcurementRequest", id, "STATUS", { status }, actor);
  return row;
}

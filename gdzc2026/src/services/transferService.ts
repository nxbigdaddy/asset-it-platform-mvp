import type { TransferOrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { nextOrderNo } from "../lib/orderNo.js";
import { getRequiredTransferSteps } from "./approvalSettingsService.js";
import { writeAudit } from "./auditService.js";
import { enqueueErpSync } from "./erpService.js";

export async function listTransferOrders(take = 100) {
  return prisma.transferOrder.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      asset: { select: { id: true, assetNo: true, name: true } },
      fromOrgUnit: true,
      toOrgUnit: true,
      fromLocation: true,
      toLocation: true,
      applicant: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export async function createTransferOrder(input: {
  assetId: string;
  fromOrgUnitId?: string | null;
  toOrgUnitId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  remark?: string | null;
  applicantUserId?: string | null;
  actor?: string;
}) {
  const row = await prisma.transferOrder.create({
    data: {
      orderNo: nextOrderNo("TR"),
      assetId: input.assetId,
      fromOrgUnitId: input.fromOrgUnitId ?? undefined,
      toOrgUnitId: input.toOrgUnitId ?? undefined,
      fromLocationId: input.fromLocationId ?? undefined,
      toLocationId: input.toLocationId ?? undefined,
      remark: input.remark ?? undefined,
      applicantUserId: input.applicantUserId ?? undefined,
      status: "DRAFT",
    },
    include: {
      asset: true,
      fromOrgUnit: true,
      toOrgUnit: true,
      fromLocation: true,
      toLocation: true,
    },
  });
  await writeAudit("TransferOrder", row.id, "CREATE", { orderNo: row.orderNo }, input.actor);
  return row;
}

async function setStatus(
  id: string,
  status: TransferOrderStatus,
  patch: { rejectedReason?: string | null },
  actor?: string,
) {
  return prisma.transferOrder.update({
    where: { id },
    data: {
      status,
      ...(status === "REJECTED" && { approvalStep: 0 }),
      ...(patch.rejectedReason !== undefined && { rejectedReason: patch.rejectedReason }),
    },
    include: {
      asset: true,
      fromOrgUnit: true,
      toOrgUnit: true,
      fromLocation: true,
      toLocation: true,
    },
  });
}

export async function submitTransferOrder(id: string, actor?: string) {
  const cur = await prisma.transferOrder.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "DRAFT") throw new Error("仅草稿可提交");
  const row = await prisma.transferOrder.update({
    where: { id },
    data: { status: "PENDING", approvalStep: 0, rejectedReason: null },
    include: {
      asset: true,
      fromOrgUnit: true,
      toOrgUnit: true,
      fromLocation: true,
      toLocation: true,
    },
  });
  await writeAudit("TransferOrder", id, "SUBMIT", {}, actor);
  return row;
}

export async function rejectTransferOrder(id: string, reason: string, actor?: string) {
  const cur = await prisma.transferOrder.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "PENDING") throw new Error("仅待审批可驳回");
  const row = await setStatus(id, "REJECTED", { rejectedReason: reason }, actor);
  await writeAudit("TransferOrder", id, "REJECT", { reason }, actor);
  return row;
}

export async function approveTransferOrder(id: string, actor?: string) {
  const cur = await prisma.transferOrder.findUniqueOrThrow({
    where: { id },
    include: { asset: true },
  });
  if (cur.status !== "PENDING") throw new Error("仅待审批可通过");

  const required = await getRequiredTransferSteps();
  const nextStep = cur.approvalStep + 1;

  if (nextStep < required) {
    const partial = await prisma.transferOrder.update({
      where: { id },
      data: { approvalStep: nextStep },
      include: {
        asset: true,
        fromOrgUnit: true,
        toOrgUnit: true,
        fromLocation: true,
        toLocation: true,
      },
    });
    await writeAudit("TransferOrder", id, "APPROVE_STEP", { step: nextStep, required }, actor);
    return partial;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: cur.assetId },
      data: {
        ...(cur.toOrgUnitId != null && { orgUnitId: cur.toOrgUnitId }),
        ...(cur.toLocationId != null && { locationId: cur.toLocationId }),
      },
    });
    return tx.transferOrder.update({
      where: { id },
      data: { status: "COMPLETED", approvalStep: nextStep },
      include: {
        asset: true,
        fromOrgUnit: true,
        toOrgUnit: true,
        fromLocation: true,
        toLocation: true,
      },
    });
  });

  await writeAudit("TransferOrder", id, "COMPLETE", { assetId: cur.assetId }, actor);
  await enqueueErpSync("TRANSFER", id, {
    event: "TRANSFER_COMPLETED",
    orderNo: updated.orderNo,
    assetId: cur.assetId,
  });
  return updated;
}

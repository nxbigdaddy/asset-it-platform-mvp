import type { DisposalOrderStatus, DisposalType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { nextOrderNo } from "../lib/orderNo.js";
import { getRequiredDisposalSteps } from "./approvalSettingsService.js";
import { writeAudit } from "./auditService.js";
import { enqueueErpSync } from "./erpService.js";

export async function listDisposalOrders(take = 100) {
  return prisma.disposalOrder.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      asset: { select: { id: true, assetNo: true, name: true } },
      applicant: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export async function createDisposalOrder(input: {
  assetId: string;
  disposalType: DisposalType;
  reason?: string | null;
  applicantUserId?: string | null;
  actor?: string;
}) {
  const row = await prisma.disposalOrder.create({
    data: {
      orderNo: nextOrderNo("DS"),
      assetId: input.assetId,
      disposalType: input.disposalType,
      reason: input.reason ?? undefined,
      applicantUserId: input.applicantUserId ?? undefined,
      status: "DRAFT",
    },
    include: { asset: true },
  });
  await writeAudit("DisposalOrder", row.id, "CREATE", { orderNo: row.orderNo }, input.actor);
  return row;
}

async function setStatus(
  id: string,
  status: DisposalOrderStatus,
  patch: { rejectedReason?: string | null },
) {
  return prisma.disposalOrder.update({
    where: { id },
    data: {
      status,
      ...(patch.rejectedReason !== undefined && { rejectedReason: patch.rejectedReason }),
    },
    include: { asset: true },
  });
}

export async function submitDisposalOrder(id: string, actor?: string) {
  const cur = await prisma.disposalOrder.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "DRAFT") throw new Error("仅草稿可提交");
  const row = await prisma.disposalOrder.update({
    where: { id },
    data: { status: "PENDING", approvalStep: 0, rejectedReason: null },
    include: { asset: true },
  });
  await writeAudit("DisposalOrder", id, "SUBMIT", {}, actor);
  return row;
}

export async function rejectDisposalOrder(id: string, reason: string, actor?: string) {
  const cur = await prisma.disposalOrder.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "PENDING") throw new Error("仅待审批可驳回");
  const row = await setStatus(id, "REJECTED", { rejectedReason: reason });
  await writeAudit("DisposalOrder", id, "REJECT", { reason }, actor);
  return row;
}

export async function approveDisposalOrder(id: string, actor?: string) {
  const cur = await prisma.disposalOrder.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "PENDING") throw new Error("仅待审批可通过");

  const required = await getRequiredDisposalSteps();
  const nextStep = cur.approvalStep + 1;

  if (nextStep < required) {
    const partial = await prisma.disposalOrder.update({
      where: { id },
      data: { approvalStep: nextStep },
      include: { asset: true },
    });
    await writeAudit("DisposalOrder", id, "APPROVE_STEP", { step: nextStep, required }, actor);
    return partial;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: cur.assetId },
      data: { status: "DISPOSED" },
    });
    return tx.disposalOrder.update({
      where: { id },
      data: { status: "COMPLETED", approvalStep: nextStep },
      include: { asset: true },
    });
  });

  await writeAudit("DisposalOrder", id, "COMPLETE", { assetId: cur.assetId }, actor);
  await enqueueErpSync("DISPOSAL", id, {
    event: "DISPOSAL_COMPLETED",
    orderNo: updated.orderNo,
    assetId: cur.assetId,
    disposalType: updated.disposalType,
  });
  return updated;
}

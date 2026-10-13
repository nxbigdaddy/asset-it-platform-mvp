import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";
import { enqueueErpSync } from "./erpService.js";

function decN(x: { toString(): string } | null | undefined): number {
  if (x == null) return 0;
  return Number(x.toString());
}

/** 直线法月折旧额（简化）：(原值-残值)/折旧月数 */
function monthlyDepreciation(
  original: { toString(): string } | null,
  salvage: { toString(): string } | null,
  months: number | null,
): number {
  if (!original || !months || months <= 0) return 0;
  const o = decN(original);
  const s = salvage ? decN(salvage) : 0;
  const m = (o - s) / months;
  return m > 0 ? m : 0;
}

export async function listDepreciationRuns() {
  return prisma.depreciationRun.findMany({ orderBy: { period: "desc" } });
}

export async function runDepreciationForPeriod(period: string, actor?: string) {
  const existing = await prisma.depreciationRun.findUnique({ where: { period } });
  if (existing?.status === "POSTED") throw new Error("该期间已结账");

  const assets = await prisma.asset.findMany({
    where: {
      status: { in: ["IN_USE", "IDLE", "UNDER_REPAIR"] },
      originalValue: { not: null },
    },
    select: {
      id: true,
      assetNo: true,
      originalValue: true,
      salvageValue: true,
      depreciationMonths: true,
    },
  });

  let total = 0;
  for (const a of assets) {
    total += monthlyDepreciation(a.originalValue, a.salvageValue, a.depreciationMonths);
  }

  const row = await prisma.depreciationRun.upsert({
    where: { period },
    create: {
      period,
      status: "DRAFT",
      totalAmount: total > 0 ? String(total.toFixed(2)) : "0",
      assetCount: assets.length,
      runAt: new Date(),
    },
    update: {
      totalAmount: total > 0 ? String(total.toFixed(2)) : "0",
      assetCount: assets.length,
      runAt: new Date(),
      status: "DRAFT",
    },
  });

  await writeAudit("DepreciationRun", row.id, "RUN", { period, total, assetCount: assets.length }, actor);
  return row;
}

export async function postDepreciationRun(period: string, actor?: string) {
  const run = await prisma.depreciationRun.findUniqueOrThrow({ where: { period } });
  if (run.status === "POSTED") throw new Error("已入账");

  const updated = await prisma.depreciationRun.update({
    where: { period },
    data: { status: "POSTED" },
  });

  await writeAudit("DepreciationRun", run.id, "POST", { period }, actor);
  await enqueueErpSync("DEPRECIATION_RUN", run.id, {
    event: "DEPRECIATION_POSTED",
    period,
    totalAmount: run.totalAmount,
  });
  return updated;
}

export async function financeCardSummary() {
  const assets = await prisma.asset.findMany({
    where: { originalValue: { not: null } },
    select: {
      id: true,
      assetNo: true,
      name: true,
      originalValue: true,
      salvageValue: true,
      depreciationMonths: true,
      inServiceDate: true,
      status: true,
    },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  return assets.map((a) => {
    const orig = a.originalValue ? Number(a.originalValue) : 0;
    const sal = a.salvageValue ? Number(a.salvageValue) : 0;
    const months = a.depreciationMonths ?? 0;
    const monthly = monthlyDepreciation(a.originalValue, a.salvageValue, a.depreciationMonths);
    const elapsed = months > 0 ? Math.min(months, 120) : 0;
    const net = orig > 0 ? Math.max(orig - monthly * elapsed, sal) : orig;
    return {
      ...a,
      monthlyDepreciation: monthly,
      bookNet: net,
    };
  });
}

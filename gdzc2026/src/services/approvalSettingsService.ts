import { prisma } from "../lib/prisma.js";

const KEY_TRANSFER = "approval.transfer.steps";
const KEY_DISPOSAL = "approval.disposal.steps";

function clampSteps(n: number): number {
  if (Number.isNaN(n) || n < 1) return 1;
  return Math.min(n, 10);
}

export async function getRequiredTransferSteps(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: KEY_TRANSFER } });
  return clampSteps(parseInt(s?.value ?? "1", 10));
}

export async function getRequiredDisposalSteps(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: KEY_DISPOSAL } });
  return clampSteps(parseInt(s?.value ?? "1", 10));
}

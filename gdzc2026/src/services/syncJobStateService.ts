import { prisma } from "../lib/prisma.js";

/** 记录企业微信等同步任务的一次执行结果 */
export async function touchSyncJob(
  id: string,
  opts: { ok: boolean; error?: string | null },
): Promise<void> {
  const now = new Date();
  await prisma.syncJobState.upsert({
    where: { id },
    create: {
      id,
      lastRunAt: now,
      lastSuccessAt: opts.ok ? now : null,
      lastError: opts.ok ? null : (opts.error ?? "未知错误"),
    },
    update: {
      lastRunAt: now,
      ...(opts.ok
        ? { lastSuccessAt: now, lastError: null }
        : { lastError: opts.error ?? "未知错误" }),
    },
  });
}

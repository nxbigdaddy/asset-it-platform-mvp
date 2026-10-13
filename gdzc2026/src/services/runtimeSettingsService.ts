import { prisma } from "../lib/prisma.js";

export async function getSettingValue(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value?.trim() ? row.value.trim() : null;
}

/** 数据库优先，否则环境变量 */
export async function getWeworkCorpId(): Promise<string | null> {
  return (await getSettingValue("wework.corp_id")) ?? process.env.WEWORK_CORP_ID?.trim() ?? null;
}

export async function getWeworkCorpSecret(): Promise<string | null> {
  return (await getSettingValue("wework.corp_secret")) ?? process.env.WEWORK_CORP_SECRET?.trim() ?? null;
}

export async function getWeworkRootDeptId(): Promise<number> {
  const v =
    (await getSettingValue("wework.root_dept_id")) ??
    process.env.WEWORK_ROOT_DEPT_ID?.trim() ??
    "1";
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 1 : n;
}

/** 与历史环境变量逻辑兼容：库表或 .env 任一存在即可 */
export async function isWeworkRemoteConfigured(): Promise<boolean> {
  const id = await getWeworkCorpId();
  const sec = await getWeworkCorpSecret();
  return !!(id && sec);
}

/** 同步间隔（分钟）：数据库 sync.scheduler.minutes 优先于环境变量 */
export async function getSyncSchedulerMinutes(): Promise<number> {
  const db = await getSettingValue("sync.scheduler.minutes");
  const raw = db ?? process.env.SYNC_SCHEDULER_MINUTES ?? "0";
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

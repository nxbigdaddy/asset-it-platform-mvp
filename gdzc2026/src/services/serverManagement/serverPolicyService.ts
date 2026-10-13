import { getSettingValue } from "../systemSettingsService.js";

/** 全局开关：默认关闭写操作 */
export async function isGlobalServerWriteEnabled(): Promise<boolean> {
  const v = await getSettingValue("server.management.global_write_enabled");
  return v === "true" || v === "1";
}

/** 全局自动化总开关（定时任务 / 将来 Agent 回调等可复用） */
export async function isGlobalServerAutomationEnabled(): Promise<boolean> {
  const v = await getSettingValue("server.management.global_automation_enabled");
  return v === "true" || v === "1";
}

export async function assertServerWriteAllowed(allowWrite: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!allowWrite) {
    return { ok: false, reason: "该角色未开启「允许写入」" };
  }
  const g = await isGlobalServerWriteEnabled();
  if (!g) {
    return { ok: false, reason: "全局已关闭服务器写操作（参数 server.management.global_write_enabled）" };
  }
  return { ok: true };
}

/** 实例级 allowAutomation + 全局 server.management.global_automation_enabled */
export async function assertServerAutomationAllowed(
  allowAutomation: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!allowAutomation) {
    return { ok: false, reason: "该角色未开启「允许自动化」" };
  }
  const g = await isGlobalServerAutomationEnabled();
  if (!g) {
    return { ok: false, reason: "全局已关闭服务器自动化（参数 server.management.global_automation_enabled）" };
  }
  return { ok: true };
}

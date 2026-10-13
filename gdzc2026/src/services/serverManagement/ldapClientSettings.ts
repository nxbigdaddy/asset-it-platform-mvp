import { getSettingValue } from "../systemSettingsService.js";

/** LDAP 操作超时（毫秒），来自 SystemSetting，缺省 60000，范围 5000–300000 */
export async function getLdapClientTimeouts(): Promise<{ timeout: number; connectTimeout: number }> {
  const raw = await getSettingValue("server.management.ldap_timeout_ms");
  const ms = raw?.trim() ? parseInt(raw.trim(), 10) : NaN;
  const timeout = Number.isFinite(ms) ? Math.min(Math.max(ms, 5000), 300_000) : 60_000;
  const connectTimeout = Math.min(30_000, Math.max(3000, Math.floor(timeout / 4)));
  return { timeout, connectTimeout };
}

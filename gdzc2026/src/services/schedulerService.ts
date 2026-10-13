import { writeAudit } from "./auditService.js";
import { getSyncSchedulerMinutes } from "./runtimeSettingsService.js";
import { touchSyncJob } from "./syncJobStateService.js";
import { isWeworkRemoteConfigured, pullRemoteWxSync } from "./weworkRemoteSync.js";

/**
 * 若配置了企微 corpid/secret（参数设置或环境变量），则按间隔拉取通讯录；
 * 否则仅写心跳与审计。间隔分钟数：`sync.scheduler.minutes` 或 `SYNC_SCHEDULER_MINUTES`。
 */
export async function startBackgroundSchedulers(): Promise<void> {
  const min = await getSyncSchedulerMinutes();
  if (!min || min < 1) return;

  const ms = min * 60 * 1000;
  const handle = setInterval(() => {
    void (async () => {
      try {
        if (await isWeworkRemoteConfigured()) {
          await pullRemoteWxSync();
          await touchSyncJob("wx-scheduled-heartbeat", { ok: true });
        } else {
          await touchSyncJob("wx-scheduled-heartbeat", { ok: true });
          await writeAudit("Scheduler", "tick", "HEARTBEAT", { minutes: min });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await touchSyncJob("wx-scheduled-heartbeat", { ok: false, error: msg });
      }
    })();
  }, ms);
  if (typeof handle.unref === "function") handle.unref();
}

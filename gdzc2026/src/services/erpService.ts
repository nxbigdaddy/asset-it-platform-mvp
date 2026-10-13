import { createHmac } from "node:crypto";
import type { ErpEntityType, ErpSyncDirection } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

const ERP_WEBHOOK_URL = process.env.ERP_WEBHOOK_URL?.trim();
const ERP_WEBHOOK_SECRET = process.env.ERP_WEBHOOK_SECRET?.trim();
const ERP_TIMEOUT_MS = Math.min(Math.max(parseInt(process.env.ERP_TIMEOUT_MS ?? "15000", 10) || 15000, 3000), 120000);

/**
 * 将业务事件写入 ERP 同步队列（出站）；真实对接时由 worker 调用 ERP 适配器
 */
export async function enqueueErpSync(
  entityType: ErpEntityType,
  entityId: string,
  payload: unknown,
  direction: ErpSyncDirection = "OUTBOUND_TO_ERP",
): Promise<{ queueId: string }> {
  const row = await prisma.erpSyncQueue.create({
    data: {
      entityType,
      entityId,
      payload: JSON.stringify(payload),
      direction,
      status: "PENDING",
    },
  });
  await writeAudit("ErpQueue", row.id, "ENQUEUE", { entityType, entityId });
  return { queueId: row.id };
}

/**
 * 处理队列：若配置 `ERP_WEBHOOK_URL` 则 POST JSON；否则直接标记 DONE（离线模式）。
 */
export async function processPendingErpQueue(limit = 10): Promise<{ processed: number; failed: number }> {
  const items = await prisma.erpSyncQueue.findMany({
    where: { status: "PENDING" },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      if (!ERP_WEBHOOK_URL) {
        await prisma.erpSyncQueue.update({
          where: { id: item.id },
          data: { status: "DONE", lastError: null },
        });
        processed++;
        continue;
      }

      const body = JSON.stringify({
        queueId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        direction: item.direction,
        payload: JSON.parse(item.payload) as unknown,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Gdzc-Queue-Id": item.id,
      };
      if (ERP_WEBHOOK_SECRET) {
        const sig = createHmac("sha256", ERP_WEBHOOK_SECRET).update(body).digest("hex");
        headers["X-Signature"] = sig;
      }

      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), ERP_TIMEOUT_MS);
      const res = await fetch(ERP_WEBHOOK_URL, {
        method: "POST",
        headers,
        body,
        signal: ac.signal,
      }).finally(() => clearTimeout(t));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ERP HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
      }

      await prisma.erpSyncQueue.update({
        where: { id: item.id },
        data: { status: "DONE", lastError: null },
      });
      await writeAudit("ErpQueue", item.id, "DISPATCH_OK", { entityType: item.entityType });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.erpSyncQueue.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          lastError: msg.slice(0, 2000),
        },
      });
      failed++;
    }
  }
  return { processed, failed };
}

export async function registerErpAssetRef(
  assetId: string,
  erpAssetId: string,
  erpBook?: string,
): Promise<void> {
  await prisma.erpAssetRef.upsert({
    where: {
      assetId_erpBook: {
        assetId,
        erpBook: erpBook ?? "DEFAULT",
      },
    },
    create: { assetId, erpAssetId, erpBook: erpBook ?? "DEFAULT" },
    update: { erpAssetId },
  });
}

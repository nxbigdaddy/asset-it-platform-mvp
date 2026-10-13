import type { InventoryTaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { nextOrderNo } from "../lib/orderNo.js";
import { writeAudit } from "./auditService.js";

export async function listInventoryTasks(take = 100) {
  return prisma.inventoryTask.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { lines: true } },
    },
  });
}

export async function getInventoryTask(id: string) {
  return prisma.inventoryTask.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          asset: { select: { id: true, assetNo: true, name: true, status: true } },
        },
      },
    },
  });
}

export async function createInventoryTask(input: {
  name: string;
  plannedDate?: Date | null;
  scopeOrgUnitId?: string | null;
  notes?: string | null;
  actor?: string;
}) {
  const row = await prisma.inventoryTask.create({
    data: {
      taskNo: nextOrderNo("INV"),
      name: input.name,
      plannedDate: input.plannedDate ?? undefined,
      scopeOrgUnitId: input.scopeOrgUnitId ?? undefined,
      notes: input.notes ?? undefined,
      status: "PLANNED",
    },
  });
  await writeAudit("InventoryTask", row.id, "CREATE", { taskNo: row.taskNo }, input.actor);
  return row;
}

export async function startInventoryTask(id: string, actor?: string) {
  const cur = await prisma.inventoryTask.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "PLANNED") throw new Error("仅计划中任务可开始");
  const row = await prisma.inventoryTask.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });
  await writeAudit("InventoryTask", id, "START", {}, actor);
  return row;
}

export async function addInventoryLinesByAssetNo(taskId: string, assetNo: string, actor?: string) {
  const asset = await prisma.asset.findUnique({ where: { assetNo } });
  if (!asset) throw new Error(`资产编号不存在: ${assetNo}`);
  return addInventoryLines(taskId, [asset.id], actor);
}

export async function addInventoryLines(taskId: string, assetIds: string[], actor?: string) {
  const task = await prisma.inventoryTask.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new Error("任务已结束，不可添加行");
  }
  await prisma.$transaction(
    assetIds.map((assetId) =>
      prisma.inventoryLine.upsert({
        where: { taskId_assetId: { taskId, assetId } },
        create: { taskId, assetId, bookQty: 1 },
        update: {},
      }),
    ),
  );
  await writeAudit("InventoryTask", taskId, "ADD_LINES", { assetIds }, actor);
  return getInventoryTask(taskId);
}

export async function recordInventoryCount(
  lineId: string,
  input: { actualQty: number; varianceReason?: string | null },
  actor?: string,
) {
  const line = await prisma.inventoryLine.findUniqueOrThrow({ where: { id: lineId } });
  const task = await prisma.inventoryTask.findUniqueOrThrow({ where: { id: line.taskId } });
  if (task.status !== "IN_PROGRESS") throw new Error("仅进行中的任务可录入实盘");

  const row = await prisma.inventoryLine.update({
    where: { id: lineId },
    data: {
      actualQty: input.actualQty,
      varianceReason: input.varianceReason ?? undefined,
      countedAt: new Date(),
    },
    include: { asset: true },
  });
  await writeAudit("InventoryLine", lineId, "COUNT", input, actor);
  return row;
}

export async function completeInventoryTask(id: string, actor?: string) {
  const cur = await prisma.inventoryTask.findUniqueOrThrow({ where: { id } });
  if (cur.status !== "IN_PROGRESS") throw new Error("仅进行中的任务可完结");
  const row = await prisma.inventoryTask.update({
    where: { id },
    data: { status: "COMPLETED" },
  });
  await writeAudit("InventoryTask", id, "COMPLETE", {}, actor);
  return row;
}

export async function cancelInventoryTask(id: string, actor?: string) {
  const cur = await prisma.inventoryTask.findUniqueOrThrow({ where: { id } });
  if (cur.status === "COMPLETED") throw new Error("已完成的任务不可取消");
  const row = await prisma.inventoryTask.update({
    where: { id },
    data: { status: "CANCELLED" as InventoryTaskStatus },
  });
  await writeAudit("InventoryTask", id, "CANCEL", {}, actor);
  return row;
}

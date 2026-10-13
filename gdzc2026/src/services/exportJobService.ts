import fs from "node:fs";
import { prisma } from "../lib/prisma.js";
import { ensureUploadDirs, exportFilePath } from "../lib/uploadPaths.js";
import { writeAudit } from "./auditService.js";

export async function listExportJobs(take = 50) {
  return prisma.exportJob.findMany({
    take,
    orderBy: { createdAt: "desc" },
  });
}

export async function createExportJob(
  type: "ASSET_CSV" | "AUDIT_CSV",
  createdById?: string | null,
  actor?: string,
) {
  ensureUploadDirs();
  const row = await prisma.exportJob.create({
    data: {
      type,
      status: "PENDING",
      createdById: createdById ?? undefined,
    },
  });
  await writeAudit("ExportJob", row.id, "CREATE", { type }, actor);
  await runExportJob(row.id);
  return prisma.exportJob.findUniqueOrThrow({ where: { id: row.id } });
}

export async function runExportJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "DONE") return;

  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", lastError: null },
  });

  try {
    const outPath = exportFilePath(jobId);
    if (job.type === "ASSET_CSV") {
      const assets = await prisma.asset.findMany({
        orderBy: { createdAt: "desc" },
        include: { category: true, orgUnit: true, location: true },
      });
      const header = ["assetNo", "name", "status", "category", "orgUnit", "location", "createdAt"];
      const lines = [header.join(",")];
      for (const a of assets) {
        const row = [
          csvEscape(a.assetNo),
          csvEscape(a.name),
          csvEscape(a.status),
          csvEscape(a.category.name),
          csvEscape(a.orgUnit?.name ?? ""),
          csvEscape(a.location ? `${a.location.code} ${a.location.name}` : ""),
          csvEscape(a.createdAt.toISOString()),
        ];
        lines.push(row.join(","));
      }
      fs.writeFileSync(outPath, "\uFEFF" + lines.join("\n"), "utf-8");
      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          filePath: `exports/${jobId}.csv`,
          fileName: `assets-${jobId.slice(0, 8)}.csv`,
          rowCount: assets.length,
          completedAt: new Date(),
        },
      });
    } else {
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const header = ["createdAt", "entityType", "entityId", "action", "actor", "detail"];
      const lines = [header.join(",")];
      for (const l of logs) {
        const row = [
          csvEscape(l.createdAt.toISOString()),
          csvEscape(l.entityType),
          csvEscape(l.entityId),
          csvEscape(l.action),
          csvEscape(l.actor ?? ""),
          csvEscape((l.detail ?? "").slice(0, 2000)),
        ];
        lines.push(row.join(","));
      }
      fs.writeFileSync(outPath, "\uFEFF" + lines.join("\n"), "utf-8");
      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          filePath: `exports/${jobId}.csv`,
          fileName: `audit-${jobId.slice(0, 8)}.csv`,
          rowCount: logs.length,
          completedAt: new Date(),
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: msg },
    });
  }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function getExportFileAbsolutePath(jobId: string): string {
  return exportFilePath(jobId);
}

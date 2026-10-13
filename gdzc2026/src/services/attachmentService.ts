import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path, { resolve as pathResolve } from "node:path";
import { prisma } from "../lib/prisma.js";
import { attachmentDir, ensureUploadDirs } from "../lib/uploadPaths.js";
import { writeAudit } from "./auditService.js";

const MAX_BYTES = 15 * 1024 * 1024;

export async function listAttachments(assetId: string) {
  return prisma.assetAttachment.findMany({
    where: { assetId },
    orderBy: { createdAt: "desc" },
  });
}

export async function saveAttachment(
  assetId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  uploadedById?: string | null,
  actor?: string,
) {
  if (buffer.length > MAX_BYTES) throw new Error("文件超过 15MB 限制");
  await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  ensureUploadDirs();
  const dir = attachmentDir(assetId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName).slice(0, 16);
  const storedName = `${randomUUID()}${ext}`;
  const full = path.join(dir, storedName);
  fs.writeFileSync(full, buffer);

  const row = await prisma.assetAttachment.create({
    data: {
      assetId,
      storedName,
      originalName: originalName.slice(0, 255),
      mimeType: mimeType.slice(0, 128),
      sizeBytes: buffer.length,
      uploadedById: uploadedById ?? undefined,
    },
  });
  await writeAudit("AssetAttachment", row.id, "CREATE", { assetId, originalName }, actor);
  return row;
}

export function resolveAttachmentFile(assetId: string, storedName: string): string {
  if (storedName.includes("..") || /[/\\]/.test(storedName)) throw new Error("非法文件名");
  const base = pathResolve(attachmentDir(assetId));
  const full = pathResolve(base, storedName);
  if (!full.startsWith(base)) throw new Error("非法路径");
  return full;
}

export async function deleteAttachment(id: string, actor?: string) {
  const row = await prisma.assetAttachment.findUniqueOrThrow({ where: { id } });
  const full = resolveAttachmentFile(row.assetId, row.storedName);
  await prisma.assetAttachment.delete({ where: { id } });
  try {
    fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
  await writeAudit("AssetAttachment", id, "DELETE", {}, actor);
}

/** 简易重复校验（可选） */
export function fileSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

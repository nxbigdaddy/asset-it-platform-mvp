import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 项目根下 uploads（与 web/dist 同级） */
export const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

export function ensureUploadDirs(): void {
  fs.mkdirSync(path.join(UPLOAD_ROOT, "exports"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_ROOT, "attachments"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_ROOT, "branding"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_ROOT, "server-jobs"), { recursive: true });
}

export function exportFilePath(jobId: string): string {
  return path.join(UPLOAD_ROOT, "exports", `${jobId}.csv`);
}

export function attachmentDir(assetId: string): string {
  return path.join(UPLOAD_ROOT, "attachments", assetId);
}

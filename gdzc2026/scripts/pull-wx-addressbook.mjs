/**
 * 一次性从企业微信拉取部门+成员并写入本地库（需 .env 中 WEWORK_* 与可用 DATABASE_URL）。
 * 用法：npx tsx scripts/pull-wx-addressbook.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const { pullRemoteWxSync } = await import("../src/services/weworkRemoteSync.js");
const result = await pullRemoteWxSync();
console.log("拉取完成:", JSON.stringify(result, null, 2));

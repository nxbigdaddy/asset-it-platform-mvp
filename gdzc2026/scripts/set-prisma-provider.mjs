/**
 * 根据环境变量 DATABASE_PROVIDER 写入 prisma/schema.prisma 的 datasource provider。
 * 取值：sqlite | mysql | sqlserver（与 Prisma 官方 provider 名一致）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const schemaPath = path.join(root, "prisma", "schema.prisma");

function loadEnv() {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const env = { ...process.env, ...loadEnv() };
const p = (env.DATABASE_PROVIDER || "sqlite").toLowerCase();
const map = {
  sqlite: "sqlite",
  mysql: "mysql",
  mariadb: "mysql",
  sqlserver: "sqlserver",
  mssql: "sqlserver",
};

const provider = map[p];
if (!provider) {
  console.error(`Unknown DATABASE_PROVIDER="${p}". Use sqlite | mysql | sqlserver`);
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, "utf8");
schema = schema.replace(/provider\s*=\s*"(sqlite|mysql|sqlserver|postgresql)"/, `provider = "${provider}"`);
fs.writeFileSync(schemaPath, schema, "utf8");
console.log(`Prisma datasource provider set to "${provider}" (${p})`);

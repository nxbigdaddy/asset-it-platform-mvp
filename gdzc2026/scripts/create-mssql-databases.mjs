/**
 * 在 SQL Server 上创建应用库（若不存在）。
 * 环境变量：MSSQL_SERVER、MSSQL_USER、MSSQL_PASSWORD（与 .env 一致）
 * 可选：MSSQL_PORT — 若指定固定 TCP 端口，则不再使用命名实例解析（需 SQL Server 已开 TCP）
 * MSSQL_DATABASES 可选，默认：gdzc,gdzc_test
 *
 * 命名实例 `HOST\INSTANCE`：使用 tedious 的 instanceName（需服务器上 SQL Server Browser 服务运行，UDP 1434 可达）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mssql from "mssql";

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

function buildConnectionConfig() {
  const serverRaw = process.env.MSSQL_SERVER;
  const user = process.env.MSSQL_USER;
  const password = YOUR_PASSWORD;
  const portEnv = process.env.MSSQL_PORT;

  const options = {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 60000,
  };

  if (portEnv) {
    const port = Number(portEnv);
    const host = serverRaw.includes("\\") ? serverRaw.split("\\")[0] : serverRaw;
    return { server: host, port, user, password, database: "master", options };
  }

  /** Windows 本机命名实例 `.\实例名` → localhost + instanceName（`.` 不能单独作 host） */
  if (serverRaw.startsWith(".\\")) {
    return {
      server: "localhost",
      user,
      password,
      database: "master",
      options: { ...options, instanceName: serverRaw.slice(2) },
    };
  }

  const backslash = serverRaw.indexOf("\\");
  if (backslash > 0) {
    return {
      server: serverRaw.slice(0, backslash),
      user,
      password,
      database: "master",
      options: { ...options, instanceName: serverRaw.slice(backslash + 1) },
    };
  }

  return { server: serverRaw, user, password, database: "master", options };
}

async function main() {
  const user = process.env.MSSQL_USER;
  const password = YOUR_PASSWORD;
  const serverRaw = process.env.MSSQL_SERVER;
  if (!serverRaw || !user || !password) {
    console.error("请设置 MSSQL_SERVER、MSSQL_USER、MSSQL_PASSWORD（见 .env.example）");
    process.exit(1);
  }

  const names = (process.env.MSSQL_DATABASES || "gdzc,gdzc_test")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const config = buildConnectionConfig();
  const label = serverRaw + (process.env.MSSQL_PORT ? `:${process.env.MSSQL_PORT}` : "");
  console.log(`连接 SQL Server: ${label}（用户 ${user}）…`);

  const pool = await mssql.connect(config);
  try {
    for (const name of names) {
      const literal = name.replace(/'/g, "''");
      const bracket = `[${name.replace(/]/g, "]]")}]`;
      await pool.request().query(
        `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${literal}') CREATE DATABASE ${bracket}`,
      );
      console.log(`数据库 [${name}] 已就绪`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

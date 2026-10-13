import http from "node:http";
import https from "node:https";
import { resolveDatabasePortsFromConfig } from "./databasePorts.js";
import { tcpProbe } from "./managedServerService.js";

export type ProbeCheck = { kind: "tcp" | "http"; target: string; ok: boolean; detail: string };

export type RoleProbeResult = {
  ok: boolean;
  message: string;
  checks: ProbeCheck[];
};

function parseTcpPorts(json: string, defaults: number[]): number[] {
  try {
    const o = JSON.parse(json || "{}") as { tcpPorts?: unknown };
    if (Array.isArray(o.tcpPorts) && o.tcpPorts.length > 0 && o.tcpPorts.every((x) => typeof x === "number")) {
      return [...new Set(o.tcpPorts as number[])];
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

type WebProbeConfig = {
  tcpPorts: number[];
  httpPort: number;
  httpsPort: number;
  probePath: string;
  tlsInsecure: boolean;
};

function parseWebConfig(json: string): WebProbeConfig {
  const defaults: WebProbeConfig = {
    tcpPorts: [80, 443, 8080, 8443],
    httpPort: 80,
    httpsPort: 443,
    probePath: "/",
    tlsInsecure: false,
  };
  try {
    const o = JSON.parse(json || "{}") as Record<string, unknown>;
    if (Array.isArray(o.tcpPorts) && o.tcpPorts.every((x) => typeof x === "number")) {
      defaults.tcpPorts = [...new Set(o.tcpPorts as number[])];
    }
    if (typeof o.httpPort === "number") defaults.httpPort = o.httpPort;
    if (typeof o.httpsPort === "number") defaults.httpsPort = o.httpsPort;
    if (typeof o.probePath === "string" && o.probePath.length > 0) {
      defaults.probePath = o.probePath.startsWith("/") ? o.probePath : `/${o.probePath}`;
    }
    if (o.tlsInsecure === true) defaults.tlsInsecure = true;
  } catch {
    /* ignore */
  }
  return defaults;
}

function httpHead(url: string, tlsInsecure: boolean): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve({ ok: false, detail: "URL 无效" });
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const port =
      u.port !== ""
        ? Number(u.port)
        : u.protocol === "https:"
          ? 443
          : 80;
    const req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: "HEAD",
        timeout: 6000,
        ...(u.protocol === "https:" && tlsInsecure ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        res.resume();
        const code = res.statusCode ?? 0;
        resolve({ ok: code > 0 && code < 500, detail: `HTTP ${code}` });
      },
    );
    req.on("error", (e) => resolve({ ok: false, detail: e instanceof Error ? e.message : String(e) }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, detail: "连接超时" });
    });
    req.end();
  });
}

/** 打印：默认探测 SMB 445、RAW 9100；可在 configJson 中配置 tcpPorts */
export async function printProbeConnection(host: string, configJson: string): Promise<RoleProbeResult> {
  const ports = parseTcpPorts(configJson, [445, 9100]);
  const checks: ProbeCheck[] = [];
  for (const port of ports) {
    const r = await tcpProbe(host, port);
    checks.push({ kind: "tcp", target: `${host}:${port}`, ok: r.ok, detail: r.message });
  }
  const anyOk = checks.some((c) => c.ok);
  const message = anyOk
    ? "部分 TCP 端口可达（常见打印/SMB）；打印机清单与作业量需后续对接 WMI/WinRM 或 Agent"
    : "未探测到常用打印相关 TCP 端口";
  return { ok: anyOk, message, checks };
}

/** 文件共享：默认 445、139 */
export async function fileShareProbeConnection(host: string, configJson: string): Promise<RoleProbeResult> {
  const ports = parseTcpPorts(configJson, [445, 139]);
  const checks: ProbeCheck[] = [];
  for (const port of ports) {
    const r = await tcpProbe(host, port);
    checks.push({ kind: "tcp", target: `${host}:${port}`, ok: r.ok, detail: r.message });
  }
  const anyOk = checks.some((c) => c.ok);
  const message = anyOk
    ? "SMB 相关端口可达；共享列表与 ACL 管理需后续对接 SMB 协议或远程 PowerShell"
    : "未探测到 SMB 常用端口";
  return { ok: anyOk, message, checks };
}

/** Web：TCP + HTTP(S) HEAD */
export async function webProbeConnection(host: string, configJson: string): Promise<RoleProbeResult> {
  const cfg = parseWebConfig(configJson);
  const checks: ProbeCheck[] = [];

  for (const port of cfg.tcpPorts) {
    const r = await tcpProbe(host, port);
    checks.push({ kind: "tcp", target: `${host}:${port}`, ok: r.ok, detail: r.message });
  }

  const httpsUrl = `https://${host}:${cfg.httpsPort}${cfg.probePath === "/" ? "/" : cfg.probePath}`;
  const httpUrl = `http://${host}:${cfg.httpPort}${cfg.probePath === "/" ? "/" : cfg.probePath}`;
  const h1 = await httpHead(httpsUrl, cfg.tlsInsecure);
  checks.push({ kind: "http", target: httpsUrl, ok: h1.ok, detail: h1.detail });
  const h2 = await httpHead(httpUrl, false);
  checks.push({ kind: "http", target: httpUrl, ok: h2.ok, detail: h2.detail });

  const anyOk = checks.some((c) => c.ok);
  const message = anyOk
    ? "部分端口或 HTTP(S) 可达；IIS/Nginx 站点管理需后续对接 WinRM/SSH 或 Agent"
    : "未探测到 Web 端口或 HTTP 响应";
  return { ok: anyOk, message, checks };
}

/** 数据库：按 engine/port/tcpPorts 多端口 TCP 探活（非 SQL 认证） */
export async function databaseProbeConnection(host: string, configJson: string): Promise<RoleProbeResult> {
  const ports = resolveDatabasePortsFromConfig(configJson);
  const checks: ProbeCheck[] = [];
  for (const port of ports) {
    const r = await tcpProbe(host, port);
    checks.push({ kind: "tcp", target: `${host}:${port}`, ok: r.ok, detail: r.message });
  }
  const anyOk = checks.some((c) => c.ok);
  const message = anyOk
    ? "部分数据库相关 TCP 端口可达（仅为网络层探测，不代表账号可登录）"
    : "未探测到配置的 TCP 端口；请检查 configJson（engine/port/tcpPorts）与防火墙";
  return { ok: anyOk, message, checks };
}

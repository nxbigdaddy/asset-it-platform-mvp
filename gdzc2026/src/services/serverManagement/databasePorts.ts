/**
 * 解析 DATABASE 角色 configJson，得到整机探活与 databaseProbe 使用的 TCP 端口。
 * 优先级：tcpPorts > port > engine 默认端口；全无则 [3306, 5432, 1433]。
 */
export function resolveDatabasePortsFromConfig(configJson: string): number[] {
  try {
    const o = JSON.parse(configJson || "{}") as {
      tcpPorts?: unknown;
      engine?: string;
      port?: number;
    };
    if (Array.isArray(o.tcpPorts) && o.tcpPorts.length > 0 && o.tcpPorts.every((x) => typeof x === "number")) {
      return [...new Set(o.tcpPorts as number[])];
    }
    if (typeof o.port === "number" && o.port > 0 && o.port <= 65535) {
      return [o.port];
    }
    if (typeof o.engine === "string" && o.engine.trim()) {
      const e = o.engine.trim().toLowerCase();
      const map: Record<string, number> = {
        mysql: 3306,
        mariadb: 3306,
        postgresql: 5432,
        postgres: 5432,
        sqlserver: 1433,
        mssql: 1433,
        mongodb: 27017,
        redis: 6379,
        oracle: 1521,
      };
      const p = map[e];
      if (p) return [p];
    }
  } catch {
    /* ignore */
  }
  return [3306, 5432, 1433];
}

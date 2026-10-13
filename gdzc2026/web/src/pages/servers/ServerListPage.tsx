import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";

type RoleTag = { id: string; role: string; isPrimary: boolean; allowWrite: boolean };

type ServerRow = {
  id: string;
  name: string;
  host: string;
  osType: string;
  enabled: boolean;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  lastProbeMsg: string | null;
  hasCredential: boolean;
  roles: RoleTag[];
};

export function ServerListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canProbe = user?.role !== "viewer";
  const [items, setItems] = useState<ServerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const load = useCallback(() => {
    apiGet<ServerRow[]>("/api/servers")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((s) => {
      const roles = s.roles.map((r) => r.role).join(" ");
      return (
        s.name.toLowerCase().includes(query) ||
        s.host.toLowerCase().includes(query) ||
        s.osType.toLowerCase().includes(query) ||
        roles.toLowerCase().includes(query)
      );
    });
  }, [items, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  return (
    <PageShell
      title="服务器管理"
      description="登记多类型服务器（AD / 打印 / 文件共享 / Web / 数据库），配置凭据与角色后在详情页进行连接测试与目录查询。"
      showDevBanner={false}
      extra={
        isAdmin ? (
          <Link to="/app/servers/new" className="mock-btn primary">
            新建服务器
          </Link>
        ) : null
      }
    >
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">暂无服务器。{isAdmin ? "请点击「新建服务器」。" : ""}</div>
      ) : (
        <>
          <div className="quick-actions" style={{ alignItems: "center" }}>
            <input
              className="mock-input"
              style={{ flex: "1 1 320px" }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索：名称 / 主机 / 系统 / 角色"
            />
            {filtered.length === 0 ? (
              <span className="muted" style={{ fontSize: 13 }}>
                没有匹配结果
              </span>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                共 {filtered.length} 台服务器
              </span>
            )}
          </div>

          <div className="stat-row" style={{ marginBottom: 12 }}>
            {pageRows.map((s) => (
              <div key={s.id} className="stat-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span className="mono">{s.host}</span> · {s.osType}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="badge" style={{ marginLeft: "auto" }}>
                      {s.hasCredential ? "已配置" : "未配置"}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {s.lastProbeAt ? `${s.lastProbeOk ? "✓" : "✗"} ${new Date(s.lastProbeAt).toLocaleString()}` : "—"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="stat-label">角色</div>
                  <div>
                    {s.roles.length ? (
                      s.roles.map((r) => (
                        <span key={r.id} className="badge" style={{ marginRight: 6, marginBottom: 6, display: "inline-block" }}>
                          {r.role}
                          {r.isPrimary ? "·主" : ""}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>

                <div className="quick-actions" style={{ marginBottom: 0 }}>
                  <Link className="mock-btn ghost" to={`/app/servers/${s.id}`}>
                    详情
                  </Link>
                  {canProbe ? (
                    <button
                      type="button"
                      className="mock-btn"
                      onClick={() => void apiPost(`/api/servers/${s.id}/probe`, {}).then(load).catch((e: Error) => alert(e.message))}
                    >
                      探活
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mock-pagination">
            第 {safePage}/{totalPages} 页，显示{" "}
            {(safePage - 1) * pageSize + 1}-{Math.min(filtered.length, safePage * pageSize)} / 共 {filtered.length} 条
            {"  "}
            <button
              type="button"
              className="mock-btn ghost"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              上一页
            </button>
            <button
              type="button"
              className="mock-btn ghost"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}

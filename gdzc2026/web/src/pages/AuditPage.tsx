import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { PageShell } from "../components/PageShell";

type Row = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string | null;
  detail: string | null;
  createdAt: string;
};

export function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Row[]>("/api/audit-logs?take=200")
      .then(setRows)
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <PageShell title="审计日志" description="已对接查询接口" showDevBanner={false}>
        <div className="inline-alert">{err}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="审计日志"
      description="关键操作留痕，便于内控与追溯。"
      showDevBanner={false}
    >
      {rows.length === 0 ? (
        <div className="empty-state">暂无记录</div>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>对象类型</th>
                <th>对象 ID</th>
                <th>动作</th>
                <th>操作者</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.entityType}</td>
                  <td className="mono">{r.entityId}</td>
                  <td>{r.action}</td>
                  <td>{r.actor ?? "—"}</td>
                  <td className="cell-ellipsis" title={r.detail ?? ""}>
                    {r.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

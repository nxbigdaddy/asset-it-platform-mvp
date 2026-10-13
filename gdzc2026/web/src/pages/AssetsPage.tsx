import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPostFormData, downloadAuthorizedFile } from "../api";
import { PageShell } from "../components/PageShell";
import { useAuth } from "../context/AuthContext";

type AssetRow = {
  id: string;
  assetNo: string;
  name: string;
  status: string;
  hostnameGenerated: string | null;
  category: { code: string; name: string };
  orgUnit: { name: string; shortCode: string | null } | null;
  assignments: { wxUser: { userid: string; name: string } }[];
};

type ListRes = { items: AssetRow[]; total: number };

export function AssetsPage() {
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const [data, setData] = useState<ListRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [listActionErr, setListActionErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ListRes>("/api/assets?take=100")
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <PageShell title="资产台账" description="已对接列表接口" showDevBanner={false}>
        <div className="inline-alert">加载失败：{err}</div>
        <p className="muted">
          请确认后端已启动（<code className="mono">npm run dev</code>）。
        </p>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell title="资产台账" description="已对接列表接口" showDevBanner={false}>
        <p className="muted">加载中…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="资产台账"
      description={`共 ${data.total} 条记录。支持详情、编辑、附件上传与导出。`}
      showDevBanner={false}
      extra={
        <div className="page-actions">
          {canWrite && (
            <>
              <button
                type="button"
                className="mock-btn ghost"
                onClick={() =>
                  void downloadAuthorizedFile("/api/assets/import-template.xlsx", "assets-import-template.xlsx")
                }
              >
                下载导入模板
              </button>
              <button
                type="button"
                className="mock-btn ghost"
                onClick={() => void downloadAuthorizedFile("/api/assets/export.xlsx", "assets-export.xlsx")}
              >
                导出 Excel
              </button>
              <label className="mock-btn ghost" style={{ cursor: "pointer", margin: 0 }}>
                导入 Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setImportMsg(null);
                    const fd = new FormData();
                    fd.append("file", f);
                    void apiPostFormData<{ created: number; updated: number; errors: string[] }>(
                      "/api/assets/import",
                      fd,
                    )
                      .then((r) => {
                        const tail = r.errors.length ? `；提示 ${r.errors.length} 条（首条：${r.errors[0] ?? ""}）` : "";
                        setImportMsg(`创建 ${r.created} 条，更新 ${r.updated} 条${tail}`);
                        void apiGet<ListRes>("/api/assets?take=100").then(setData);
                      })
                      .catch((er: Error) => setImportMsg(er.message));
                  }}
                />
              </label>
            </>
          )}
          <Link to="/app/assets/new" className="mock-btn primary">
            新建资产
          </Link>
        </div>
      }
    >
      {importMsg && <div className="inline-alert" style={{ marginBottom: 12 }}>{importMsg}</div>}
      {listActionErr && (
        <div className="inline-alert" style={{ marginBottom: 12 }}>
          {listActionErr}
        </div>
      )}
      {data.items.length === 0 ? (
        <div className="empty-state">暂无数据，请前往「新建资产」或执行 seed。</div>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>资产编号</th>
                <th>名称</th>
                <th>类别</th>
                <th>状态</th>
                <th>计算机名</th>
                <th>组织</th>
                <th>使用人</th>
                <th style={{ width: canWrite ? 160 : 100 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.assetNo}</td>
                  <td>{a.name}</td>
                  <td>
                    {a.category.code} · {a.category.name}
                  </td>
                  <td>
                    <span className="badge">{a.status}</span>
                  </td>
                  <td className="mono">{a.hostnameGenerated ?? "—"}</td>
                  <td>{a.orgUnit ? `${a.orgUnit.shortCode ?? ""} ${a.orgUnit.name}` : "—"}</td>
                  <td>
                    {a.assignments.length
                      ? a.assignments.map((x) => x.wxUser.name).join("、")
                      : "—"}
                  </td>
                  <td>
                    <Link className="link-action" to={`/app/assets/${a.id}`}>
                      详情
                    </Link>
                    {canWrite && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="link-action"
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            font: "inherit",
                            color: "inherit",
                          }}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `确定删除资产「${a.assetNo} ${a.name}」？将同时删除关联的调拨单、处置单与盘点行记录，且不可恢复。`,
                              )
                            )
                              return;
                            setListActionErr(null);
                            void apiDelete(`/api/assets/${a.id}`)
                              .then(() =>
                                apiGet<ListRes>("/api/assets?take=100").then((r) => {
                                  setData(r);
                                }),
                              )
                              .catch((e: Error) => setListActionErr(e.message));
                          }}
                        >
                          删除
                        </button>
                      </>
                    )}
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

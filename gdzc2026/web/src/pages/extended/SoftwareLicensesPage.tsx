import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";

type Lic = {
  id: string;
  name: string;
  vendor: string | null;
  totalSeats: number;
  usedSeats: number;
  expireAt: string | null;
  asset: { id: string; assetNo: string; name: string } | null;
};

export function PageSoftwareLicenses() {
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const [items, setItems] = useState<Lic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("Office 365");
  const [vendor, setVendor] = useState("Microsoft");
  const [totalSeats, setTotalSeats] = useState(100);

  const load = useCallback(() => {
    apiGet<Lic[]>("/api/software-licenses")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="软件许可"
      description="许可证席位与到期管理；可关联资产。"
      showDevBanner={false}
      extra={
        canWrite ? (
          <div className="form-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="mock-input" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="mock-input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            <input
              type="number"
              className="mock-input"
              style={{ width: 90 }}
              value={totalSeats}
              onChange={(e) => setTotalSeats(parseInt(e.target.value, 10) || 0)}
            />
            <button
              type="button"
              className="mock-btn primary"
              onClick={() =>
                void apiPost("/api/software-licenses", {
                  name,
                  vendor,
                  totalSeats,
                  usedSeats: 0,
                }).then(load)
              }
            >
              新建许可
            </button>
          </div>
        ) : null
      }
    >
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>厂商</th>
                <th>席位</th>
                <th>到期</th>
                <th>关联资产</th>
                {canWrite && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.vendor ?? "—"}</td>
                  <td>
                    {x.usedSeats}/{x.totalSeats}
                  </td>
                  <td>{x.expireAt ? new Date(x.expireAt).toLocaleDateString() : "—"}</td>
                  <td>
                    {x.asset ? (
                      <Link to={`/app/assets/${x.asset.id}`}>{x.asset.assetNo}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canWrite && (
                    <td>
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => {
                          const u = window.prompt("已用席位数", String(x.usedSeats));
                          if (u !== null)
                            void apiPatch(`/api/software-licenses/${x.id}`, {
                              usedSeats: parseInt(u, 10) || 0,
                            }).then(load);
                        }}
                      >
                        更新用量
                      </button>
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => {
                          if (window.confirm("删除？"))
                            void apiDelete(`/api/software-licenses/${x.id}`).then(load);
                        }}
                      >
                        删除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

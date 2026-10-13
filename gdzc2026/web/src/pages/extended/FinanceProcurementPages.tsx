import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";

type Pr = {
  id: string;
  requestNo: string;
  title: string;
  status: string;
  expectedAmount: string | null;
  relatedAssetId: string | null;
  asset: { id: string; assetNo: string; name: string } | null;
};

export function PageProcurementPending() {
  const [items, setItems] = useState<Pr[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("到货待验收");

  const load = useCallback(() => {
    apiGet<Pr[]>("/api/procurement/requests")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="验收待转固"
      description="采购到货与验收跟踪；状态可更新为已资本化。"
      showDevBanner={false}
      extra={
        <button
          type="button"
          className="mock-btn primary"
          onClick={() =>
            void apiPost("/api/procurement/requests", { title }).then(() => load())
          }
        >
          新建申请
        </button>
      }
    >
      <div className="form-row" style={{ marginBottom: 12 }}>
        <input className="mock-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>标题</th>
                <th>状态</th>
                <th>关联资产</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.requestNo}</td>
                  <td>{p.title}</td>
                  <td>{p.status}</td>
                  <td>
                    {p.asset ? (
                      <Link to={`/app/assets/${p.asset.id}`}>{p.asset.assetNo}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() =>
                        void apiPatch(`/api/procurement/requests/${p.id}`, {
                          status: "CAPITALIZED",
                        }).then(load)
                      }
                    >
                      标记转固
                    </button>
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

export function PageProcurementOrders() {
  const [items, setItems] = useState<Pr[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<Pr[]>("/api/procurement/requests")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="采购关联"
      description="与转固申请同一数据源，便于从采购视角查看。"
      showDevBanner={false}
    >
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>标题</th>
                <th>状态</th>
                <th>预计金额</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.requestNo}</td>
                  <td>{p.title}</td>
                  <td>{p.status}</td>
                  <td>{p.expectedAmount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

type DepRun = {
  id: string;
  period: string;
  status: string;
  totalAmount: string | null;
  assetCount: number;
};

export function PageFinanceDepreciation() {
  const [items, setItems] = useState<DepRun[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(() => {
    apiGet<DepRun[]>("/api/finance/depreciation-runs")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="折旧汇总"
      description="按期间计提（直线法月折旧），草稿可入账并推送 ERP 队列。"
      showDevBanner={false}
      extra={
        <div className="form-row" style={{ gap: 8 }}>
          <input className="mock-input mono" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() =>
              void apiPost("/api/finance/depreciation-runs", { period }).then(() => load())
            }
          >
            运行计提
          </button>
        </div>
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
                <th>期间</th>
                <th>资产数</th>
                <th>本期折旧合计</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.period}</td>
                  <td>{r.assetCount}</td>
                  <td>{r.totalAmount ?? "—"}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.status === "DRAFT" && (
                      <button
                        type="button"
                        className="mock-btn primary"
                        onClick={() =>
                          void apiPost(
                            `/api/finance/depreciation-runs/${encodeURIComponent(r.period)}/post`,
                            {},
                          ).then(() => load())
                        }
                      >
                        入账
                      </button>
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

type CardRow = {
  id: string;
  assetNo: string;
  name: string;
  originalValue: string | null;
  salvageValue: string | null;
  depreciationMonths: number | null;
  monthlyDepreciation: number;
  bookNet: number;
};

export function PageFinanceCards() {
  const [items, setItems] = useState<CardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<CardRow[]>("/api/finance/cards")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <PageShell title="财务卡片视图" description="原值、月折旧与简化账面净值（演示算法）。" showDevBanner={false}>
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>资产编号</th>
                <th>名称</th>
                <th>原值</th>
                <th>残值</th>
                <th>月折旧</th>
                <th>账面净值(简)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.assetNo}</td>
                  <td>
                    <Link to={`/app/assets/${r.id}`}>{r.name}</Link>
                  </td>
                  <td>{r.originalValue ?? "—"}</td>
                  <td>{r.salvageValue ?? "—"}</td>
                  <td>{r.monthlyDepreciation.toFixed(2)}</td>
                  <td>{r.bookNet.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";

type TransferRow = {
  id: string;
  orderNo: string;
  status: string;
  approvalStep: number;
  asset: { id: string; assetNo: string; name: string };
  fromOrgUnit: { name: string } | null;
  toOrgUnit: { name: string } | null;
};

export function PageAssetTransfers() {
  const [items, setItems] = useState<TransferRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assetId, setAssetId] = useState("");
  const [toOrg, setToOrg] = useState("");
  const [transferSteps, setTransferSteps] = useState(1);

  const load = useCallback(() => {
    apiGet<TransferRow[]>("/api/transfers")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiGet<{ transferSteps: number; disposalSteps: number }>("/api/system/approval-config")
      .then((c) => setTransferSteps(Math.max(1, c.transferSteps)))
      .catch(() => setTransferSteps(1));
  }, []);

  return (
    <PageShell
      title="资产调拨"
      description="跨部门/地点调拨：草稿 → 提交 → 审批通过后记账并更新资产归属。"
      showDevBanner={false}
    >
      <div className="mock-toolbar">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <input
            className="mock-input"
            placeholder="资产 ID（列表或详情中复制）"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            style={{ minWidth: 200, maxWidth: "min(100%, 320px)" }}
          />
          <input
            className="mock-input"
            placeholder="调入部门 ID（企微部门）"
            value={toOrg}
            onChange={(e) => setToOrg(e.target.value)}
            style={{ maxWidth: "min(100%, 280px)" }}
          />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() => {
              void apiPost("/api/transfers", {
                assetId,
                toOrgUnitId: toOrg || null,
              }).then(() => {
                setAssetId("");
                load();
              });
            }}
          >
            新建调拨
          </button>
        </div>
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
                <th>资产</th>
                <th>调出</th>
                <th>调入</th>
                <th>状态</th>
                {transferSteps > 1 ? <th>审批进度</th> : null}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.orderNo}</td>
                  <td>
                    <Link to={`/app/assets/${t.asset.id}`} className="link">
                      {t.asset.assetNo}
                    </Link>{" "}
                    {t.asset.name}
                  </td>
                  <td>{t.fromOrgUnit?.name ?? "—"}</td>
                  <td>{t.toOrgUnit?.name ?? "—"}</td>
                  <td>{t.status}</td>
                  {transferSteps > 1 ? (
                    <td className="muted">
                      {t.status === "PENDING"
                        ? `已审 ${t.approvalStep}/${transferSteps} 步`
                        : "—"}
                    </td>
                  ) : null}
                  <td>
                    {t.status === "DRAFT" && (
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => void apiPost(`/api/transfers/${t.id}/submit`, {}).then(load)}
                      >
                        提交
                      </button>
                    )}
                    {t.status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          className="mock-btn primary"
                          onClick={() => void apiPost(`/api/transfers/${t.id}/approve`, {}).then(load)}
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          className="mock-btn ghost"
                          onClick={() => {
                            const reason = window.prompt("驳回原因") ?? "";
                            if (reason)
                              void apiPost(`/api/transfers/${t.id}/reject`, { reason }).then(load);
                          }}
                        >
                          驳回
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

type DisposalRow = {
  id: string;
  orderNo: string;
  status: string;
  approvalStep: number;
  disposalType: string;
  asset: { id: string; assetNo: string; name: string };
};

export function PageAssetDisposals() {
  const [items, setItems] = useState<DisposalRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assetId, setAssetId] = useState("");
  const [disposalSteps, setDisposalSteps] = useState(1);

  const load = useCallback(() => {
    apiGet<DisposalRow[]>("/api/disposals")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiGet<{ transferSteps: number; disposalSteps: number }>("/api/system/approval-config")
      .then((c) => setDisposalSteps(Math.max(1, c.disposalSteps)))
      .catch(() => setDisposalSteps(1));
  }, []);

  return (
    <PageShell
      title="资产处置"
      description="报废/变卖/捐赠：审批通过后资产状态变更为已处置并推送 ERP 队列。"
      showDevBanner={false}
    >
      <div className="mock-toolbar">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <input
            className="mock-input"
            placeholder="资产 ID"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            style={{ maxWidth: "min(100%, 280px)" }}
          />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() => {
              void apiPost("/api/disposals", {
                assetId,
                disposalType: "SCRAP",
                reason: "申请报废",
              }).then(() => {
                setAssetId("");
                load();
              });
            }}
          >
            新建处置（报废）
          </button>
        </div>
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
                <th>资产</th>
                <th>方式</th>
                <th>状态</th>
                {disposalSteps > 1 ? <th>审批进度</th> : null}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.orderNo}</td>
                  <td>
                    <Link to={`/app/assets/${d.asset.id}`}>{d.asset.assetNo}</Link> {d.asset.name}
                  </td>
                  <td>{d.disposalType}</td>
                  <td>{d.status}</td>
                  {disposalSteps > 1 ? (
                    <td className="muted">
                      {d.status === "PENDING"
                        ? `已审 ${d.approvalStep}/${disposalSteps} 步`
                        : "—"}
                    </td>
                  ) : null}
                  <td>
                    {d.status === "DRAFT" && (
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => void apiPost(`/api/disposals/${d.id}/submit`, {}).then(load)}
                      >
                        提交
                      </button>
                    )}
                    {d.status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          className="mock-btn primary"
                          onClick={() => void apiPost(`/api/disposals/${d.id}/approve`, {}).then(load)}
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          className="mock-btn ghost"
                          onClick={() => {
                            const reason = window.prompt("驳回原因") ?? "";
                            if (reason)
                              void apiPost(`/api/disposals/${d.id}/reject`, { reason }).then(load);
                          }}
                        >
                          驳回
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

type InvTask = {
  id: string;
  taskNo: string;
  name: string;
  status: string;
  plannedDate: string | null;
  _count: { lines: number };
};

export function PageInventoryTasks() {
  const [items, setItems] = useState<InvTask[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("年度盘点");

  const load = useCallback(() => {
    apiGet<InvTask[]>("/api/inventory/tasks")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="盘点任务"
      description="创建任务 → 开始 → 添加资产行 → 在执行页录入实盘。"
      showDevBanner={false}
    >
      <div className="mock-toolbar">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <input
            className="mock-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: "min(100%, 280px)" }}
          />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() =>
              void apiPost("/api/inventory/tasks", { name }).then(() => {
                load();
              })
            }
          >
            新建任务
          </button>
        </div>
      </div>
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>任务号</th>
                <th>名称</th>
                <th>状态</th>
                <th>行数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.taskNo}</td>
                  <td>{t.name}</td>
                  <td>{t.status}</td>
                  <td>{t._count.lines}</td>
                  <td>
                    {t.status === "PLANNED" && (
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => void apiPost(`/api/inventory/tasks/${t.id}/start`, {}).then(load)}
                      >
                        开始
                      </button>
                    )}
                    {t.status === "IN_PROGRESS" && (
                      <button
                        type="button"
                        className="mock-btn primary"
                        onClick={() => void apiPost(`/api/inventory/tasks/${t.id}/complete`, {}).then(load)}
                      >
                        完结
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

type InvDetail = {
  id: string;
  taskNo: string;
  status: string;
  lines: {
    id: string;
    bookQty: number;
    actualQty: number | null;
    asset: { assetNo: string; name: string };
  }[];
};

export function PageInventoryExecute() {
  const [taskId, setTaskId] = useState("");
  const [detail, setDetail] = useState<InvDetail | null>(null);
  const [assetIds, setAssetIds] = useState("");
  const [assetNo, setAssetNo] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((id: string) => {
    if (!id) return;
    apiGet<InvDetail>(`/api/inventory/tasks/${id}`)
      .then(setDetail)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <PageShell
      title="盘点执行"
      description="选择任务 ID，添加盘点资产行并录入实盘数量。"
      showDevBanner={false}
    >
      {err && <div className="inline-alert">{err}</div>}
      <div className="form-row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="mock-input"
          placeholder="任务 ID"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button type="button" className="mock-btn primary" onClick={() => load(taskId)}>
          加载任务
        </button>
      </div>
      {detail && (
        <>
          <p className="muted">
            {detail.taskNo} · {detail.status} · {detail.lines.length} 行
          </p>
          <div className="form-row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              className="mock-input"
              placeholder="资产 ID，多个用逗号分隔"
              value={assetIds}
              onChange={(e) => setAssetIds(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              type="button"
              className="mock-btn"
              onClick={() => {
                const ids = assetIds
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                void apiPost(`/api/inventory/tasks/${detail.id}/lines`, { assetIds: ids }).then(() =>
                  load(detail.id),
                );
              }}
            >
              添加行
            </button>
            <input
              className="mock-input"
              placeholder="或按资产编号添加"
              value={assetNo}
              onChange={(e) => setAssetNo(e.target.value)}
              style={{ minWidth: 160 }}
            />
            <button
              type="button"
              className="mock-btn primary"
              onClick={() => {
                const no = assetNo.trim();
                if (!no) return;
                void apiPost(`/api/inventory/tasks/${detail.id}/lines-by-asset-no`, { assetNo: no }).then(
                  () => {
                    setAssetNo("");
                    load(detail.id);
                  },
                );
              }}
            >
              按编号添加
            </button>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>资产</th>
                  <th>账存</th>
                  <th>实盘</th>
                  <th>录入</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.asset.assetNo} {line.asset.name}
                    </td>
                    <td>{line.bookQty}</td>
                    <td>{line.actualQty ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => {
                          const v = window.prompt("实盘数量", String(line.bookQty));
                          if (v !== null)
                            void apiPost(`/api/inventory/lines/${line.id}/count`, {
                              actualQty: parseInt(v, 10) || 0,
                            }).then(() => load(detail.id));
                        }}
                      >
                        录入
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}

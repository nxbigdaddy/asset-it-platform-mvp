import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPostFormData, getToken } from "../../api";
import { DetailFieldGrid, DetailTabBar } from "../../components/DetailFieldGrid";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";

type FieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  optionsJson: string | null;
  active: boolean;
};

type AssetDetail = {
  id: string;
  assetNo: string;
  name: string;
  status: string;
  hostnameGenerated: string | null;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
  remarks: string | null;
  originalValue: string | null;
  salvageValue: string | null;
  depreciationMonths: number | null;
  inServiceDate: string | null;
  customFieldsJson?: unknown;
  category: { code: string; name: string };
  location: { code: string; name: string } | null;
  orgUnit: { name: string; shortCode: string | null } | null;
  costCenter: { code: string; name: string } | null;
  ledgerBook: { code: string; name: string } | null;
  namingPolicy: { name: string } | null;
  assignments: {
    id: string;
    status: string;
    wxUser: { userid: string; name: string };
    purpose: string | null;
  }[];
  ipBindings: {
    role: string;
    ipAddress: { address: string; subnet?: { cidr: string } | null };
  }[];
  erpRefs: { erpAssetId: string; erpBook: string }[];
};

type Att = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type DetailTab = "base" | "assign" | "ip" | "fin" | "doc";

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const [data, setData] = useState<AssetDetail | null>(null);
  const [attachments, setAttachments] = useState<Att[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("base");
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    apiGet<AssetDetail>(`/api/assets/${id}`)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
    apiGet<Att[]>(`/api/assets/${id}/attachments`)
      .then(setAttachments)
      .catch(() => setAttachments([]));
    apiGet<FieldDef[]>("/api/asset-field-definitions")
      .then((defs) => setFieldDefs(defs.filter((d) => d.active)))
      .catch(() => setFieldDefs([]));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) {
    return (
      <PageShell title="资产详情" description="" showDevBanner={false}>
        <div className="inline-alert">{err}</div>
        <Link to="/app/assets" className="mock-btn link">
          返回列表
        </Link>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell title="资产详情" description="加载中…" showDevBanner={false}>
        <p className="muted">加载中…</p>
      </PageShell>
    );
  }

  const activeAssignments = data.assignments.filter((a) => a.status === "ACTIVE");
  const users = activeAssignments.filter((a) => a.wxUser).map((a) => a.wxUser.name);

  const tabs = [
    { key: "base" as const, label: "基本信息" },
    { key: "assign" as const, label: "分配与责任人" },
    { key: "ip" as const, label: "IP 与网络" },
    { key: "fin" as const, label: "财务与 ERP" },
    { key: "doc" as const, label: "附件" },
  ];

  return (
    <PageShell
      title={`资产详情 · ${data.assetNo}`}
      description={`${data.name}。状态：${data.status}`}
      showDevBanner={false}
      extra={
        <div className="page-actions">
          {canWrite && (
            <>
              <Link to={`/app/assets/${id}/edit`} className="mock-btn primary">
                编辑
              </Link>
              <button
                type="button"
                className="mock-btn ghost"
                onClick={() => {
                  if (
                    !window.confirm(
                      `确定删除资产「${data.assetNo} ${data.name}」？将同时删除关联的调拨单、处置单与盘点行记录，且不可恢复。`,
                    )
                  )
                    return;
                  setDeleteErr(null);
                  void apiDelete(`/api/assets/${id}`)
                    .then(() => navigate("/app/assets"))
                    .catch((e: Error) => setDeleteErr(e.message));
                }}
              >
                删除
              </button>
            </>
          )}
          <Link to="/app/assets" className="mock-btn link">
            返回列表
          </Link>
        </div>
      }
    >
      {deleteErr && (
        <div className="inline-alert" style={{ marginBottom: 12 }}>
          {deleteErr}
        </div>
      )}
      <div className="detail-summary">
        <div className="detail-summary-card">
          <span className="detail-k">状态</span>
          <span className="detail-v">{data.status}</span>
        </div>
        <div className="detail-summary-card">
          <span className="detail-k">计算机名</span>
          <span className="detail-v mono">{data.hostnameGenerated ?? "—"}</span>
        </div>
        <div className="detail-summary-card">
          <span className="detail-k">使用人</span>
          <span className="detail-v">{users.length ? users.join("、") : "—"}</span>
        </div>
      </div>

      <DetailTabBar
        tabs={tabs}
        active={tab}
        onChange={(k) => setTab(k as DetailTab)}
      />

      {tab === "base" && (
        <div className="detail-panel">
          <h2 className="detail-panel-title">基本信息</h2>
          <DetailFieldGrid
            rows={(() => {
              const cf =
                data.customFieldsJson &&
                typeof data.customFieldsJson === "object" &&
                !Array.isArray(data.customFieldsJson)
                  ? (data.customFieldsJson as Record<string, unknown>)
                  : {};
              const customRows = fieldDefs.map((d) => ({
                label: d.label,
                value:
                  cf[d.key] != null && cf[d.key] !== ""
                    ? typeof cf[d.key] === "boolean"
                      ? cf[d.key]
                        ? "是"
                        : "否"
                      : String(cf[d.key])
                    : undefined,
              }));
              return [
                { label: "资产名称", value: data.name },
                { label: "资产编号", value: <span className="mono">{data.assetNo}</span> },
                {
                  label: "资产类别",
                  value: `${data.category.code} ${data.category.name}`,
                },
                {
                  label: "品牌型号",
                  value: [data.brand, data.model].filter(Boolean).join(" ") || undefined,
                },
                { label: "序列号", value: data.serialNo ?? undefined },
                { label: "命名策略", value: data.namingPolicy?.name },
                { label: "所属部门", value: data.orgUnit?.name },
                {
                  label: "存放位置",
                  value: data.location ? `${data.location.code} ${data.location.name}` : undefined,
                },
                { label: "备注", value: data.remarks ?? undefined },
                ...customRows.map((r) => ({ label: r.label, value: r.value })),
              ];
            })()}
          />
        </div>
      )}

      {tab === "assign" && (
        <div className="detail-panel">
          <h2 className="detail-panel-title">分配与责任人</h2>
          {data.assignments.length === 0 ? (
            <p className="muted">暂无分配记录</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>姓名</th>
                    <th>userid</th>
                    <th>用途</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.status}</td>
                      <td>{a.wxUser.name}</td>
                      <td className="mono">{a.wxUser.userid}</td>
                      <td>{a.purpose ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "ip" && (
        <div className="detail-panel">
          <h2 className="detail-panel-title">IP 与网络</h2>
          {data.ipBindings.length === 0 ? (
            <p className="muted">暂无 IP 绑定</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th>IP</th>
                    <th>网段</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ipBindings.map((b, i) => (
                    <tr key={`${b.ipAddress.address}-${i}`}>
                      <td>{b.role}</td>
                      <td className="mono">{b.ipAddress.address}</td>
                      <td className="mono">{b.ipAddress.subnet?.cidr ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "fin" && (
        <div className="detail-panel">
          <h2 className="detail-panel-title">财务与 ERP</h2>
          <DetailFieldGrid
            rows={[
              { label: "原值", value: data.originalValue ?? undefined },
              { label: "残值", value: data.salvageValue ?? undefined },
              {
                label: "折旧月数",
                value:
                  data.depreciationMonths != null ? String(data.depreciationMonths) : undefined,
              },
              {
                label: "启用日期",
                value: data.inServiceDate
                  ? new Date(data.inServiceDate).toLocaleDateString()
                  : undefined,
              },
              {
                label: "成本中心",
                value: data.costCenter ? `${data.costCenter.code} ${data.costCenter.name}` : undefined,
              },
              {
                label: "账簿",
                value: data.ledgerBook ? `${data.ledgerBook.code} ${data.ledgerBook.name}` : undefined,
              },
            ]}
          />
          <h3 className="detail-panel-title" style={{ marginTop: 20 }}>
            ERP 资产映射
          </h3>
          {data.erpRefs.length === 0 ? (
            <p className="muted">暂无映射；可在系统 ERP 对接中处理队列后登记。</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>账套</th>
                    <th>ERP 资产号</th>
                  </tr>
                </thead>
                <tbody>
                  {data.erpRefs.map((r) => (
                    <tr key={`${r.erpBook}-${r.erpAssetId}`}>
                      <td>{r.erpBook}</td>
                      <td className="mono">{r.erpAssetId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "doc" && (
        <div className="detail-panel">
          <h2 className="detail-panel-title">附件</h2>
          {uploadErr && <div className="inline-alert">{uploadErr}</div>}
          {canWrite && id && (
            <div className="form-row" style={{ marginBottom: 12 }}>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f || !id) return;
                  setUploadErr(null);
                  const fd = new FormData();
                  fd.append("file", f);
                  void apiPostFormData(`/api/assets/${id}/attachments`, fd)
                    .then(() => load())
                    .catch((ex: Error) => setUploadErr(ex.message));
                  e.target.value = "";
                }}
              />
              <span className="muted">单文件 ≤ 15MB，文件存于服务器本地目录；对象存储可后续对接。</span>
            </div>
          )}
          {attachments === null ? (
            <p className="muted">加载附件…</p>
          ) : attachments.length === 0 ? (
            <p className="muted">暂无附件</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>大小</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.originalName}</td>
                      <td>{(a.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td>{new Date(a.createdAt).toLocaleString()}</td>
                      <td>
                        <a
                          className="mock-btn link"
                          href={`/api/attachments/${a.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(ev) => {
                            ev.preventDefault();
                            const t = getToken();
                            void fetch(`/api/attachments/${a.id}/download`, {
                              headers: t ? { Authorization: `Bearer ${t}` } : {},
                            })
                              .then((r) => r.blob())
                              .then((blob) => {
                                const url = URL.createObjectURL(blob);
                                const el = document.createElement("a");
                                el.href = url;
                                el.download = a.originalName;
                                el.click();
                                URL.revokeObjectURL(url);
                              });
                          }}
                        >
                          下载
                        </a>
                        {canWrite && (
                          <button
                            type="button"
                            className="mock-btn ghost"
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              if (window.confirm("删除附件？"))
                                void apiDelete(`/api/attachments/${a.id}`).then(load);
                            }}
                          >
                            删除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="detail-hint">多级审批、工作流与版本化附件可在后续迭代对接。</p>
    </PageShell>
  );
}

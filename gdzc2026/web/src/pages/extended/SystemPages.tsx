import { useCallback, useEffect, useState } from "react";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPostFormData,
  apiPut,
  downloadAuthorizedFile,
} from "../../api";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";
import { useBranding } from "../../context/BrandingContext";

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  orgScopeJson: string | null;
};

export function PageSystemUsers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uname, setUname] = useState("");
  const [pwd, setPwd] = useState("");
  const [newOrgScope, setNewOrgScope] = useState("");

  const load = useCallback(() => {
    if (!isAdmin) {
      setItems([]);
      return;
    }
    apiGet<UserRow[]>("/api/users")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <PageShell title="用户与角色" description="仅管理员可管理后台账号。" showDevBanner={false}>
        <div className="inline-alert">当前账号无权限</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="用户与角色"
      description="角色：admin / operator / viewer。非管理员可配置「数据范围」为企微部门 ID 的 JSON 数组，用于限制可见资产。"
      showDevBanner={false}
      extra={
        <div className="form-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="mock-input"
            placeholder="用户名"
            value={uname}
            onChange={(e) => setUname(e.target.value)}
          />
          <input
            className="mock-input"
            type="password"
            placeholder="初始密码"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <input
            className="mock-input"
            placeholder='组织范围 JSON，如 ["dept-id"]，可空'
            value={newOrgScope}
            onChange={(e) => setNewOrgScope(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() => {
              let orgScopeJson: string | null | undefined = undefined;
              const raw = newOrgScope.trim();
              if (raw) {
                try {
                  const parsed = JSON.parse(raw) as unknown;
                  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
                    throw new Error("须为字符串数组");
                  }
                  orgScopeJson = JSON.stringify(parsed);
                } catch {
                  alert("组织范围须为 JSON 数组字符串，例如 [\"wx-dept-1\"]");
                  return;
                }
              }
              void apiPost("/api/users", {
                username: uname,
                password: pwd,
                role: "operator",
                ...(orgScopeJson !== undefined && { orgScopeJson }),
              }).then(() => {
                setUname("");
                setPwd("");
                setNewOrgScope("");
                load();
              });
            }}
          >
            新建用户
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
                <th>用户名</th>
                <th>姓名</th>
                <th>角色</th>
                <th>数据范围</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.displayName ?? "—"}</td>
                  <td>{u.role}</td>
                  <td className="mono muted" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={u.orgScopeJson ?? ""}>
                    {u.orgScopeJson ?? "—"}
                  </td>
                  <td>{u.isActive ? "启用" : "停用"}</td>
                  <td>
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() => {
                        const role = window.prompt("新角色 admin/operator/viewer", u.role);
                        if (role)
                          void apiPatch(`/api/users/${u.id}`, { role }).then(load);
                      }}
                    >
                      改角色
                    </button>{" "}
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() => {
                        const raw = window.prompt(
                          '组织范围：企微部门 ID 的 JSON 数组，留空清除，例如 ["dept-1"]',
                          u.orgScopeJson ?? "",
                        );
                        if (raw === null) return;
                        const t = raw.trim();
                        if (!t) {
                          void apiPatch(`/api/users/${u.id}`, { orgScopeJson: null }).then(load);
                          return;
                        }
                        try {
                          const parsed = JSON.parse(t) as unknown;
                          if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
                            throw new Error("须为字符串数组");
                          }
                          void apiPatch(`/api/users/${u.id}`, {
                            orgScopeJson: JSON.stringify(parsed),
                          }).then(load);
                        } catch {
                          alert("须为 JSON 字符串数组");
                        }
                      }}
                    >
                      组织范围
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

type Setting = { key: string; value: string; note: string | null };

const WELL_KNOWN_SETTINGS: { key: string; label: string; hint?: string; type?: "password" }[] = [
  { key: "company.name", label: "公司名称", hint: "显示在侧栏与浏览器标题" },
  {
    key: "app.title",
    label: "系统产品名称",
    hint: "默认：资产与终端一体化平台；侧栏副标题、登录页主标题",
  },
  { key: "wework.corp_id", label: "企业微信 CorpId" },
  { key: "wework.corp_secret", label: "企业微信 Secret", type: "password", hint: "与 .env 中 WEWORK_CORP_* 二选一，数据库优先" },
  { key: "wework.root_dept_id", label: "通讯录根部门 ID", hint: "默认 1" },
  { key: "sync.scheduler.minutes", label: "定时同步间隔（分钟）", hint: "0 或空表示不启用进程内调度" },
  { key: "approval.transfer.steps", label: "调拨审批步数（1–10）" },
  { key: "approval.disposal.steps", label: "处置审批步数（1–10）" },
];

export function PageSystemSettings() {
  const { user } = useAuth();
  const branding = useBranding();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Setting[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extraKey, setExtraKey] = useState("");
  const [extraVal, setExtraVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) {
      setItems([]);
      return;
    }
    apiGet<Setting[]>("/api/system/settings")
      .then((list) => {
        setItems(list);
        const m: Record<string, string> = {};
        for (const s of list) m[s.key] = s.value;
        for (const w of WELL_KNOWN_SETTINGS) {
          if (m[w.key] === undefined) m[w.key] = "";
        }
        setValues(m);
      })
      .catch(() => setItems([]));
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <PageShell title="参数设置" description="仅管理员。" showDevBanner={false}>
        <div className="inline-alert">无权限</div>
      </PageShell>
    );
  }

  async function saveKnown() {
    setSaving(true);
    setMsg(null);
    try {
      const entries = WELL_KNOWN_SETTINGS.map((w) => ({
        key: w.key,
        value: values[w.key] ?? "",
      }));
      await apiPut("/api/system/settings/batch", { entries });
      setMsg("已保存");
      await branding.refresh();
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveExtra() {
    const k = extraKey.trim();
    if (!k) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiPut(`/api/system/settings/${encodeURIComponent(k)}`, { value: extraVal });
      setExtraKey("");
      setExtraVal("");
      setMsg("已保存自定义键");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="参数设置"
      description="企业微信、同步调度、审批步数等存于 SystemSetting；与 .env 并存时以数据库为准（见 docs/settings-keys.md）。"
      showDevBanner={false}
    >
      {msg && <div className="inline-alert">{msg}</div>}
      <div className="settings-layout">
        <section className="settings-card">
          <h3 className="detail-panel-title" style={{ marginTop: 0 }}>
            企业 Logo
          </h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            支持 png / jpg / webp / gif，最大 2MB。上传后显示在左侧栏与登录页；公司名称与产品名称见下方「常用参数」。
          </p>
          <div className="form-row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#f5f5f5" }}
              />
            ) : (
              <span className="muted">当前未上传 Logo</span>
            )}
            <label className="mock-btn ghost" style={{ cursor: "pointer", margin: 0 }}>
              上传 Logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setSaving(true);
                  setMsg(null);
                  const fd = new FormData();
                  fd.append("file", f);
                  void apiPostFormData<{ logoUrl: string }>("/api/system/branding/logo", fd)
                    .then(async () => {
                      setMsg("Logo 已更新");
                      await branding.refresh();
                      load();
                    })
                    .catch((err: Error) => setMsg(err.message))
                    .finally(() => setSaving(false));
                }}
              />
            </label>
            {branding.logoUrl ? (
              <button
                type="button"
                className="mock-btn ghost"
                disabled={saving}
                onClick={() => {
                  void apiDelete("/api/system/branding/logo")
                    .then(async () => {
                      setMsg("已清除 Logo");
                      await branding.refresh();
                      load();
                    })
                    .catch((err: Error) => setMsg(err.message));
                }}
              >
                清除 Logo
              </button>
            ) : null}
          </div>
        </section>

        <section className="settings-card">
          <h3 className="detail-panel-title" style={{ marginTop: 0 }}>
            常用参数
          </h3>
          <div className="settings-known-form">
            {WELL_KNOWN_SETTINGS.map((w) => (
              <div key={w.key} className="settings-item">
                <div className="settings-item-head">
                  <span>{w.label}</span>
                  <span className="mono muted">{w.key}</span>
                </div>
                <input
                  className="mock-input settings-input"
                  type={w.type === "password" ? "password" : "text"}
                  value={values[w.key] ?? ""}
                  placeholder={w.hint}
                  onChange={(e) => setValues((prev) => ({ ...prev, [w.key]: e.target.value }))}
                />
                {w.hint && <p className="muted settings-hint">{w.hint}</p>}
              </div>
            ))}
            <div className="page-actions">
              <button type="button" className="mock-btn primary" disabled={saving} onClick={() => void saveKnown()}>
                {saving ? "保存中…" : "保存常用参数"}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h3 className="detail-panel-title" style={{ marginTop: 0 }}>
            其他键值
          </h3>
          <div className="form-row settings-extra-row">
            <input
              className="mock-input"
              placeholder="键"
              value={extraKey}
              onChange={(e) => setExtraKey(e.target.value)}
            />
            <input
              className="mock-input"
              placeholder="值"
              value={extraVal}
              onChange={(e) => setExtraVal(e.target.value)}
            />
            <button type="button" className="mock-btn ghost" disabled={saving} onClick={() => void saveExtra()}>
              保存单条
            </button>
          </div>

          {!items?.length ? (
            <p className="muted">暂无已存参数，保存后将出现在下表。</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>键</th>
                    <th>值</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.key}>
                      <td className="mono">{s.key}</td>
                      <td>{s.key.includes("secret") ? "••••••" : s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

type FieldDefRow = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  optionsJson: string | null;
  required: boolean;
  sortOrder: number;
  active: boolean;
};

const FIELD_TYPES = ["STRING", "NUMBER", "BOOLEAN", "DATE", "SELECT"] as const;

export function PageAssetFieldDefinitions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<FieldDefRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("STRING");
  const [optionsJson, setOptionsJson] = useState("");
  const [required, setRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const load = useCallback(() => {
    if (!isAdmin) {
      setItems([]);
      return;
    }
    apiGet<FieldDefRow[]>("/api/asset-field-definitions?includeInactive=true")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <PageShell title="资产自定义字段" description="仅管理员。" showDevBanner={false}>
        <div className="inline-alert">无权限</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="资产自定义字段"
      description="定义后可在资产编辑中填写，并出现在 Excel 导入/导出列（cf_键名）。SELECT 类型请在「下拉选项 JSON」中填写字符串数组，如 [&quot;A&quot;,&quot;B&quot;]。"
      showDevBanner={false}
      extra={
        <button type="button" className="mock-btn ghost" onClick={() => void load()}>
          刷新
        </button>
      }
    >
      {err && <div className="inline-alert">{err}</div>}
      <div className="mock-form" style={{ maxWidth: 720, marginBottom: 24 }}>
        <h3 className="detail-panel-title" style={{ marginTop: 0 }}>
          新建字段
        </h3>
        <div className="mock-form-row">
          <label>键（英文，唯一）</label>
          <input className="mock-input mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="如 warranty_months" />
        </div>
        <div className="mock-form-row">
          <label>显示名称</label>
          <input className="mock-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如 保修月数" />
        </div>
        <div className="mock-form-row">
          <label>类型</label>
          <select className="mock-input" value={fieldType} onChange={(e) => setFieldType(e.target.value as (typeof FIELD_TYPES)[number])}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>下拉选项 JSON（仅 SELECT）</label>
          <input
            className="mock-input mono"
            value={optionsJson}
            onChange={(e) => setOptionsJson(e.target.value)}
            placeholder='["选项1","选项2"]'
          />
        </div>
        <div className="mock-form-row">
          <label>排序</label>
          <input
            type="number"
            className="mock-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="mock-form-row">
          <label>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> 必填
          </label>
        </div>
        <button
          type="button"
          className="mock-btn primary"
          onClick={() => {
            let opts: string | null = null;
            if (fieldType === "SELECT") {
              const raw = optionsJson.trim();
              if (!raw) {
                alert("SELECT 须填写选项 JSON");
                return;
              }
              try {
                const p = JSON.parse(raw) as unknown;
                if (!Array.isArray(p) || !p.every((x) => typeof x === "string")) throw new Error();
              } catch {
                alert("选项须为 JSON 字符串数组");
                return;
              }
              opts = raw;
            }
            void apiPost<FieldDefRow>("/api/asset-field-definitions", {
              key,
              label,
              fieldType,
              optionsJson: opts,
              required,
              sortOrder,
            }).then(() => {
              setKey("");
              setLabel("");
              setOptionsJson("");
              setRequired(false);
              setSortOrder(0);
              load();
            });
          }}
        >
          添加
        </button>
      </div>

      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>键</th>
                <th>名称</th>
                <th>类型</th>
                <th>必填</th>
                <th>排序</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.key}</td>
                  <td>{r.label}</td>
                  <td>{r.fieldType}</td>
                  <td>{r.required ? "是" : "否"}</td>
                  <td>{r.sortOrder}</td>
                  <td>{r.active ? "是" : "否"}</td>
                  <td>
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() =>
                        void apiPatch(`/api/asset-field-definitions/${r.id}`, { active: !r.active }).then(load)
                      }
                    >
                      {r.active ? "停用" : "启用"}
                    </button>{" "}
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() => {
                        if (!window.confirm("删除该字段定义？已有资产上的值仍保留在 JSON 中。")) return;
                        void apiDelete(`/api/asset-field-definitions/${r.id}`).then(load);
                      }}
                    >
                      删除
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

type QueueRow = {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  lastError: string | null;
  createdAt: string;
};

export function PageSystemErp() {
  const [items, setItems] = useState<QueueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<QueueRow[]>("/api/erp/queue")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="ERP 对接"
      description="出站队列；未配置 ERP_WEBHOOK_URL 时直接标记 DONE。配置后 POST JSON 并校验 X-Signature。"
      showDevBanner={false}
      extra={
        <button
          type="button"
          className="mock-btn primary"
          onClick={() => void apiPost("/api/erp/queue/process", {}).then(load)}
        >
          处理待发送队列
        </button>
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
                <th>类型</th>
                <th>实体</th>
                <th>状态</th>
                <th>错误</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td>{q.entityType}</td>
                  <td className="mono">{q.entityId.slice(0, 12)}…</td>
                  <td>{q.status}</td>
                  <td>{q.lastError ?? "—"}</td>
                  <td>{new Date(q.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

type IpLog = {
  id: string;
  action: string;
  createdAt: string;
  asset: { assetNo: string; name: string };
  ipAddress: { address: string; subnet: { cidr: string } };
};

export function PageNetworkIpRecords() {
  const [items, setItems] = useState<IpLog[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<IpLog[]>("/api/ip-allocation-logs?take=100")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <PageShell title="IP 分配记录" description="绑定/释放 IP 时写入。" showDevBanner={false}>
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : items.length === 0 ? (
        <p className="muted">暂无记录；新建资产并分配 IP 后将出现。</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>IP</th>
                <th>网段</th>
                <th>资产</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.action}</td>
                  <td className="mono">{r.ipAddress.address}</td>
                  <td className="mono">{r.ipAddress.subnet.cidr}</td>
                  <td>
                    {r.asset.assetNo} {r.asset.name}
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

type Summary = {
  byStatus: { status: string; count: number }[];
  byCategory: { categoryName: string; count: number }[];
  totalOriginalValue: string;
};

function ReportBarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="report-bar-row">
      <span className="report-bar-label">{label}</span>
      <div className="report-bar-track">
        <div className="report-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="report-bar-val">{value}</span>
    </div>
  );
}

export function PageReportsSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Summary>("/api/reports/summary-data")
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <PageShell title="汇总报表" description="按状态、类别聚合与原值合计。" showDevBanner={false}>
      {err && <div className="inline-alert">{err}</div>}
      {!data ? (
        <p className="muted">加载中…</p>
      ) : (
        <>
          <p>
            原值合计（有原值字段）：<strong>{data.totalOriginalValue}</strong>
          </p>
          <h3 className="detail-panel-title">按状态</h3>
          {(() => {
            const maxS = Math.max(1, ...data.byStatus.map((r) => r.count));
            return (
              <div style={{ marginBottom: 12 }}>
                {data.byStatus.map((r) => (
                  <ReportBarRow key={r.status} label={r.status} value={r.count} max={maxS} />
                ))}
              </div>
            );
          })()}
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>数量</th>
                </tr>
              </thead>
              <tbody>
                {data.byStatus.map((r) => (
                  <tr key={r.status}>
                    <td>{r.status}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="detail-panel-title" style={{ marginTop: 24 }}>
            按类别
          </h3>
          {(() => {
            const maxC = Math.max(1, ...data.byCategory.map((r) => r.count));
            return (
              <div style={{ marginBottom: 12 }}>
                {data.byCategory.map((r) => (
                  <ReportBarRow key={r.categoryName} label={r.categoryName} value={r.count} max={maxC} />
                ))}
              </div>
            );
          })()}
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>类别</th>
                  <th>数量</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map((r) => (
                  <tr key={r.categoryName}>
                    <td>{r.categoryName}</td>
                    <td>{r.count}</td>
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

type ExportJobRow = {
  id: string;
  type: string;
  status: string;
  fileName: string | null;
  rowCount: number | null;
  lastError: string | null;
  createdAt: string;
};

export function PageReportsExport() {
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const [items, setItems] = useState<ExportJobRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<ExportJobRow[]>("/api/export-jobs")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="导出中心"
      description="生成 CSV 存于服务器 uploads/exports，完成后可下载。"
      showDevBanner={false}
      extra={
        canWrite ? (
          <div className="page-actions">
            <button
              type="button"
              className="mock-btn primary"
              onClick={() =>
                void apiPost("/api/export-jobs", { type: "ASSET_CSV" }).then(() => load())
              }
            >
              导出资产台账
            </button>
            <button
              type="button"
              className="mock-btn"
              onClick={() =>
                void apiPost("/api/export-jobs", { type: "AUDIT_CSV" }).then(() => load())
              }
            >
              导出审计日志
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
                <th>类型</th>
                <th>状态</th>
                <th>行数</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id}>
                  <td>{j.type}</td>
                  <td>{j.status}</td>
                  <td>{j.rowCount ?? "—"}</td>
                  <td>{new Date(j.createdAt).toLocaleString()}</td>
                  <td>
                    {j.status === "DONE" && (
                      <button
                        type="button"
                        className="mock-btn primary"
                        onClick={() =>
                          void downloadAuthorizedFile(
                            `/api/export-jobs/${j.id}/download`,
                            j.fileName ?? "export.csv",
                          )
                        }
                      >
                        下载
                      </button>
                    )}
                    {j.status === "FAILED" && <span className="muted">{j.lastError}</span>}
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

type Mold = {
  id: string;
  moldCode: string;
  maxLife: number;
  usedCount: number;
  asset: { assetNo: string; name: string };
};

export function PageMfgMolds() {
  const [items, setItems] = useState<Mold[] | null>(null);
  const [assetId, setAssetId] = useState("");
  const [code, setCode] = useState("MOLD-001");

  const load = useCallback(() => {
    apiGet<Mold[]>("/api/mfg/molds")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="模具工装"
      description="模具与资产关联、寿命计数。"
      showDevBanner={false}
      extra={
        <div className="form-row" style={{ gap: 8 }}>
          <input className="mock-input" placeholder="资产 ID" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
          <input className="mock-input" value={code} onChange={(e) => setCode(e.target.value)} />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() =>
              void apiPost("/api/mfg/molds", { assetId, moldCode: code, maxLife: 10000 }).then(load)
            }
          >
            保存
          </button>
        </div>
      }
    >
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>模具编码</th>
                <th>资产</th>
                <th>寿命上限</th>
                <th>已用</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>{m.moldCode}</td>
                  <td>
                    {m.asset.assetNo} {m.asset.name}
                  </td>
                  <td>{m.maxLife}</td>
                  <td>{m.usedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

type Maint = {
  id: string;
  nextDue: string | null;
  lastService: string | null;
  note: string | null;
  asset: { assetNo: string; name: string };
};

export function PageMfgEquipment() {
  const [items, setItems] = useState<Maint[] | null>(null);
  const [assetId, setAssetId] = useState("");

  const load = useCallback(() => {
    apiGet<Maint[]>("/api/mfg/maintenance")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="设备与维保"
      description="维保下次到期与上次服务记录。"
      showDevBanner={false}
      extra={
        <div className="form-row" style={{ gap: 8 }}>
          <input className="mock-input" placeholder="资产 ID" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
          <button
            type="button"
            className="mock-btn primary"
            onClick={() =>
              void apiPost("/api/mfg/maintenance", {
                assetId,
                note: "初始化维保记录",
              }).then(() => {
                setAssetId("");
                load();
              })
            }
          >
            添加记录
          </button>
        </div>
      }
    >
      {!items?.length ? (
        <p className="muted">暂无记录</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>资产</th>
                <th>下次保养</th>
                <th>上次服务</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.asset.assetNo} {m.asset.name}
                  </td>
                  <td>{m.nextDue ? new Date(m.nextDue).toLocaleDateString() : "—"}</td>
                  <td>{m.lastService ? new Date(m.lastService).toLocaleDateString() : "—"}</td>
                  <td>{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

type SyncOv = {
  jobs: { id: string; lastRunAt: string | null; lastError: string | null }[];
  recentAudit: { createdAt: string; entityType: string; action: string; detail: string | null }[];
};

export function PageOrgSync() {
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const [data, setData] = useState<SyncOv | null>(null);
  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<SyncOv>("/api/sync/overview").then(setData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="同步日志"
      description="同步任务状态与近期审计（含同步相关）。服务端配置 WEWORK_CORP_ID / WEWORK_CORP_SECRET 后可从企微拉取通讯录。"
      showDevBanner={false}
      extra={
        canWrite ? (
          <button
            type="button"
            className="mock-btn primary"
            onClick={() => {
              setRemoteMsg(null);
              void apiPost<{ departments: { upserted: number }; users: { upserted: number } }>(
                "/api/wx/sync/from-remote",
                {},
              )
                .then((r) => {
                  setRemoteMsg(`已拉取：部门 ${r.departments.upserted} 条，成员 ${r.users.upserted} 条`);
                  load();
                })
                .catch((e: Error) => setRemoteMsg(e.message));
            }}
          >
            从企微拉取通讯录
          </button>
        ) : null
      }
    >
      {remoteMsg && <div className="inline-alert">{remoteMsg}</div>}
      {!data ? (
        <p className="muted">加载中…</p>
      ) : (
        <>
          <h3 className="detail-panel-title">任务状态</h3>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>上次运行</th>
                  <th>错误</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.id}</td>
                    <td>{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "—"}</td>
                    <td>{j.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="detail-panel-title" style={{ marginTop: 24 }}>
            近期审计
          </h3>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>实体</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudit.map((a, i) => (
                  <tr key={i}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.entityType}</td>
                    <td>{a.action}</td>
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

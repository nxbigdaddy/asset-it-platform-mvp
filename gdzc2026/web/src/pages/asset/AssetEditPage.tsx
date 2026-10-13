import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch } from "../../api";
import {
  AssetCustomFieldsEditor,
  type AssetCustomFieldDef,
} from "../../components/AssetCustomFieldsEditor";
import { PageShell } from "../../components/PageShell";

type AssetRow = {
  id: string;
  assetNo: string;
  name: string;
  status: string;
  remarks: string | null;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
  categoryId: string;
  locationId: string | null;
  orgUnitId: string | null;
  costCenterId: string | null;
  ledgerBookId: string | null;
  originalValue: string | null;
  salvageValue: string | null;
  depreciationMonths: number | null;
  inServiceDate: string | null;
  customFieldsJson?: unknown;
};

const STATUSES = [
  "PLANNED",
  "IN_TRANSIT",
  "PENDING_CAPITALIZATION",
  "IN_USE",
  "IDLE",
  "SEALED",
  "UNDER_REPAIR",
  "PENDING_DISPOSAL",
  "DISPOSED",
] as const;

export function AssetEditPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [cats, setCats] = useState<{ id: string; code: string; name: string }[]>([]);
  const [locs, setLocs] = useState<{ id: string; code: string; name: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [ccs, setCcs] = useState<{ id: string; code: string; name: string }[]>([]);
  const [lbs, setLbs] = useState<{ id: string; code: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldDefs, setFieldDefs] = useState<AssetCustomFieldDef[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiGet<AssetRow & { inServiceDate?: string | null }>(`/api/assets/${id}`),
      apiGet<{ id: string; code: string; name: string }[]>("/api/categories"),
      apiGet<{ id: string; code: string; name: string }[]>("/api/locations"),
      apiGet<{ id: string; name: string }[]>("/api/wx/departments"),
      apiGet<{ id: string; code: string; name: string }[]>("/api/cost-centers"),
      apiGet<{ id: string; code: string; name: string }[]>("/api/ledger-books"),
      apiGet<AssetCustomFieldDef[]>("/api/asset-field-definitions"),
    ])
      .then(([a, c, l, o, cc, lb, defs]) => {
        setAsset({
          ...a,
          inServiceDate: a.inServiceDate
            ? typeof a.inServiceDate === "string"
              ? a.inServiceDate
              : new Date(a.inServiceDate).toISOString()
            : null,
        });
        setCats(c);
        setLocs(l);
        setOrgs(o);
        setCcs(cc);
        setLbs(lb);
        setFieldDefs(defs.filter((d) => d.active));
        const raw = a.customFieldsJson;
        const base =
          raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
        setCustomFields(base);
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!asset || !id) return;
    setSaving(true);
    setErr(null);
    try {
      await apiPatch(`/api/assets/${id}`, {
        name: asset.name,
        categoryId: asset.categoryId,
        status: asset.status,
        remarks: asset.remarks,
        brand: asset.brand,
        model: asset.model,
        serialNo: asset.serialNo,
        locationId: asset.locationId,
        orgUnitId: asset.orgUnitId,
        costCenterId: asset.costCenterId,
        ledgerBookId: asset.ledgerBookId,
        originalValue: asset.originalValue,
        salvageValue: asset.salvageValue,
        depreciationMonths: asset.depreciationMonths,
        inServiceDate: asset.inServiceDate ? new Date(asset.inServiceDate).toISOString() : null,
        customFieldsJson: customFields,
      });
      nav(`/app/assets/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (err && !asset) {
    return (
      <PageShell title="编辑资产" showDevBanner={false}>
        <div className="inline-alert">{err}</div>
        <Link to="/app/assets">返回</Link>
      </PageShell>
    );
  }

  if (!asset) {
    return (
      <PageShell title="编辑资产" showDevBanner={false}>
        <p className="muted">加载中…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`编辑资产 · ${asset.assetNo}`}
      description="修改后保存将写入审计日志。"
      showDevBanner={false}
      extra={
        <Link to={`/app/assets/${id}`} className="mock-btn link">
          取消
        </Link>
      }
    >
      {err && <div className="inline-alert">{err}</div>}
      <form className="mock-form" onSubmit={onSubmit}>
        <div className="mock-form-row">
          <label>名称</label>
          <input
            className="mock-input"
            value={asset.name}
            onChange={(e) => setAsset({ ...asset, name: e.target.value })}
            required
          />
        </div>
        <div className="mock-form-row">
          <label>分类</label>
          <select
            className="mock-input"
            value={asset.categoryId}
            onChange={(e) => setAsset({ ...asset, categoryId: e.target.value })}
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>状态</label>
          <select
            className="mock-input"
            value={asset.status}
            onChange={(e) => setAsset({ ...asset, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>位置</label>
          <select
            className="mock-input"
            value={asset.locationId ?? ""}
            onChange={(e) => setAsset({ ...asset, locationId: e.target.value || null })}
          >
            <option value="">—</option>
            {locs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>组织（企微部门）</label>
          <select
            className="mock-input"
            value={asset.orgUnitId ?? ""}
            onChange={(e) => setAsset({ ...asset, orgUnitId: e.target.value || null })}
          >
            <option value="">—</option>
            {orgs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>成本中心</label>
          <select
            className="mock-input"
            value={asset.costCenterId ?? ""}
            onChange={(e) => setAsset({ ...asset, costCenterId: e.target.value || null })}
          >
            <option value="">—</option>
            {ccs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>账簿</label>
          <select
            className="mock-input"
            value={asset.ledgerBookId ?? ""}
            onChange={(e) => setAsset({ ...asset, ledgerBookId: e.target.value || null })}
          >
            <option value="">—</option>
            {lbs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mock-form-row">
          <label>品牌</label>
          <input
            className="mock-input"
            value={asset.brand ?? ""}
            onChange={(e) => setAsset({ ...asset, brand: e.target.value || null })}
          />
        </div>
        <div className="mock-form-row">
          <label>型号</label>
          <input
            className="mock-input"
            value={asset.model ?? ""}
            onChange={(e) => setAsset({ ...asset, model: e.target.value || null })}
          />
        </div>
        <div className="mock-form-row">
          <label>序列号</label>
          <input
            className="mock-input"
            value={asset.serialNo ?? ""}
            onChange={(e) => setAsset({ ...asset, serialNo: e.target.value || null })}
          />
        </div>
        <div className="mock-form-row">
          <label>原值</label>
          <input
            className="mock-input"
            value={asset.originalValue ?? ""}
            onChange={(e) => setAsset({ ...asset, originalValue: e.target.value || null })}
          />
        </div>
        <div className="mock-form-row">
          <label>残值</label>
          <input
            className="mock-input"
            value={asset.salvageValue ?? ""}
            onChange={(e) => setAsset({ ...asset, salvageValue: e.target.value || null })}
          />
        </div>
        <div className="mock-form-row">
          <label>折旧月数</label>
          <input
            type="number"
            className="mock-input"
            value={asset.depreciationMonths ?? ""}
            onChange={(e) =>
              setAsset({
                ...asset,
                depreciationMonths: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          />
        </div>
        <div className="mock-form-row">
          <label>启用日期</label>
          <input
            type="datetime-local"
            className="mock-input"
            value={
              asset.inServiceDate
                ? new Date(asset.inServiceDate).toISOString().slice(0, 16)
                : ""
            }
            onChange={(e) =>
              setAsset({
                ...asset,
                inServiceDate: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
        <div className="mock-form-row">
          <label>备注</label>
          <input
            className="mock-input"
            value={asset.remarks ?? ""}
            onChange={(e) => setAsset({ ...asset, remarks: e.target.value || null })}
          />
        </div>

        {fieldDefs.length > 0 && (
          <>
            <h3 className="detail-panel-title" style={{ marginTop: 0 }}>
              自定义字段
            </h3>
            <AssetCustomFieldsEditor
              defs={fieldDefs}
              value={customFields}
              onChange={(key, next) =>
                setCustomFields((prev) => ({ ...prev, [key]: next }))
              }
            />
          </>
        )}

        <div className="page-actions">
          <button type="submit" className="mock-btn primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}

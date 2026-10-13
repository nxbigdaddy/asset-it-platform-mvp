import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import {
  AssetCustomFieldsEditor,
  type AssetCustomFieldDef,
} from "../components/AssetCustomFieldsEditor";
import { PageShell } from "../components/PageShell";

type Cat = { id: string; code: string; name: string };
type Dept = { id: string; name: string; shortCode: string | null };
type User = { userid: string; name: string };
type Subnet = { id: string; cidr: string; purpose: string };
type Policy = { id: string; name: string; template: string };

export function NewAssetPage() {
  const [categories, setCategories] = useState<Cat[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [namingPolicyId, setNamingPolicyId] = useState("");
  const [generateHostname, setGenerateHostname] = useState(true);
  const [subnetId, setSubnetId] = useState("");
  const [autoIp, setAutoIp] = useState(true);
  const [assignUserid, setAssignUserid] = useState("");
  const [fieldDefs, setFieldDefs] = useState<AssetCustomFieldDef[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  useEffect(() => {
    Promise.all([
      apiGet<Cat[]>("/api/categories"),
      apiGet<Dept[]>("/api/wx/departments"),
      apiGet<{ userid: string; name: string }[]>("/api/wx/users"),
      apiGet<Subnet[]>("/api/subnets"),
      apiGet<Policy[]>("/api/naming-policies"),
      apiGet<AssetCustomFieldDef[]>("/api/asset-field-definitions"),
    ])
      .then(([c, d, u, s, p, defs]) => {
        setCategories(c);
        setDepts(d);
        setUsers(u.map((x) => ({ userid: x.userid, name: x.name })));
        setSubnets(s);
        setPolicies(p);
        setFieldDefs(defs.filter((x) => x.active));
        const nb = c.find((x) => x.code === "IT-NB");
        if (nb) setCategoryId(nb.id);
        const fin = d.find((x) => x.shortCode === "FIN");
        if (fin) setOrgUnitId(fin.id);
        const pol = p.find((x) => x.id === "seed-policy-nb");
        if (pol) setNamingPolicyId(pol.id);
        if (s[0]) setSubnetId(s[0].id);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const setCustomField = (key: string, next: unknown) => {
    setCustomFields((prev) => ({ ...prev, [key]: next }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDone(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name,
        categoryId,
        orgUnitId: orgUnitId || null,
        generateHostname,
        namingPolicyId: generateHostname ? namingPolicyId || null : null,
        subnetId: subnetId || null,
        autoIp: subnetId ? autoIp : false,
        assignUserid: assignUserid || null,
        customFieldsJson: customFields,
      };
      const res = await apiPost<{
        assetNo: string;
        hostnameGenerated: string | null;
      }>("/api/assets", body);
      setDone(`已创建：${res.assetNo}${res.hostnameGenerated ? `，主机名 ${res.hostnameGenerated}` : ""}`);
      setName("");
      setCustomFields({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="新建资产"
      description="填写基本信息；可选自动生成计算机名并分配 IP（需选择网段）。"
      showDevBanner={false}
    >
      {err && <div className="alert">{err}</div>}
      {done && <div className="success-banner">{done}</div>}
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            名称 *
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：财务部笔记本" />
          </label>
          <label>
            资产类别 *
            <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">请选择</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            组织归属（企业微信部门）
            <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              <option value="">无</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.shortCode ?? d.id} · {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            分配使用人（可选）
            <select value={assignUserid} onChange={(e) => setAssignUserid(e.target.value)}>
              <option value="">请选择</option>
              {users.map((u) => (
                <option key={u.userid} value={u.userid}>
                  {u.name} ({u.userid})
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={generateHostname} onChange={(e) => setGenerateHostname(e.target.checked)} />
            按策略生成计算机名
          </label>
          {generateHostname && (
            <label>
              命名策略
              <select value={namingPolicyId} onChange={(e) => setNamingPolicyId(e.target.value)}>
                <option value="">默认</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.template}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            网段（分配 IP）
            <select value={subnetId} onChange={(e) => setSubnetId(e.target.value)}>
              <option value="">不分配</option>
              {subnets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.cidr} ({s.purpose})
                </option>
              ))}
            </select>
          </label>
          {subnetId && (
            <label className="check">
              <input type="checkbox" checked={autoIp} onChange={(e) => setAutoIp(e.target.checked)} />
              自动分配下一可用 IP
            </label>
          )}
          {fieldDefs.length > 0 && (
            <>
              <h3 style={{ gridColumn: "1 / -1", margin: "12px 0 4px", fontSize: "1rem", fontWeight: 600 }}>
                自定义字段
              </h3>
              <div className="mock-form" style={{ gridColumn: "1 / -1", maxWidth: 640 }}>
                <AssetCustomFieldsEditor defs={fieldDefs} value={customFields} onChange={setCustomField} />
              </div>
            </>
          )}
        </div>
        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? "提交中…" : "创建资产"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}

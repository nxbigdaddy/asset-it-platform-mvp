import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";

export function ServerNewPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [osType, setOsType] = useState<"WINDOWS" | "LINUX" | "OTHER">("WINDOWS");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        host,
        osType,
      };
      if (username.trim() || secret) {
        if (!secret) {
          setErr("填写凭据时需填写密码");
          setSaving(false);
          return;
        }
        body.credential = {
          authType: "PASSWORD",
          username: username.trim() || null,
          secret,
        };
      }
      const row = await apiPost<{ id: string }>("/api/servers", body);
      nav(`/app/servers/${row.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="新建服务器"
      description="保存后可在详情页添加角色（AD / 打印等）并配置 JSON。"
      showDevBanner={false}
      extra={
        <Link to="/app/servers" className="mock-btn link">
          返回列表
        </Link>
      }
    >
      {err && <div className="inline-alert">{err}</div>}
      <form className="mock-form" style={{ maxWidth: 480 }} onSubmit={onSubmit}>
        <div className="mock-form-row">
          <label>显示名称 *</label>
          <input className="mock-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="mock-form-row">
          <label>主机名/IP *</label>
          <input className="mock-input" value={host} onChange={(e) => setHost(e.target.value)} required />
        </div>
        <div className="mock-form-row">
          <label>系统类型</label>
          <select className="mock-input" value={osType} onChange={(e) => setOsType(e.target.value as typeof osType)}>
            <option value="WINDOWS">Windows</option>
            <option value="LINUX">Linux</option>
            <option value="OTHER">其他</option>
          </select>
        </div>
        <h3 className="detail-panel-title">连接凭据（可选）</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          LDAP 绑定账号请填完整 DN 或使用下方用户名（与 AD 角色中 bindDN 配合）。
        </p>
        <div className="mock-form-row">
          <label>绑定用户名 / DN</label>
          <input
            className="mock-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="如 CN=svc,OU=Service,DC=corp,DC=local"
          />
        </div>
        <div className="mock-form-row">
          <label>密码</label>
          <input
            className="mock-input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="page-actions">
          <button type="submit" className="mock-btn primary" disabled={saving}>
            {saving ? "保存中…" : "创建"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}

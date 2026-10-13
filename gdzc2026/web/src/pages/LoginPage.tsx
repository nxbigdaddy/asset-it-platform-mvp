import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getToken } from "../api";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";

export function LoginPage() {
  const { login, token, ready } = useAuth();
  const { companyName, appTitle, logoUrl } = useBranding();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const from = (loc.state as { from?: string } | null)?.from ?? "/app/dashboard";

  if (ready && (token || getToken())) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          {logoUrl ? (
            <img className="login-logo-img" src={logoUrl} alt="" width={56} height={56} />
          ) : (
            <div className="login-logo">{(companyName.trim() || appTitle).slice(0, 1) || "资"}</div>
          )}
          <div>
            <h1>{appTitle}</h1>
            <p>{companyName.trim() || "制造型企业 · 内部使用"}</p>
          </div>
        </div>
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </label>
          {err && <div className="login-error">{err}</div>}
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "登录中…" : "登 录"}
          </button>
        </form>
        <p className="login-hint">
          测试账号：admin / admin123；operator / operator123（业务操作，非管理员）
        </p>
      </div>
    </div>
  );
}

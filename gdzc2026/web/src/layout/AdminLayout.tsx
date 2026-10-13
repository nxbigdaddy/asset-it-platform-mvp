import { Outlet, useNavigate } from "react-router-dom";
import { Breadcrumb } from "../components/Breadcrumb";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { Sidebar } from "./Sidebar";

export function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { companyName, appTitle, logoUrl } = useBranding();
  // 侧栏仅显示系统名称（appTitle），不显示公司名称（companyName）。
  const titleMain = appTitle.trim() || "资产与终端一体化平台";
  const titleSub = "";
  const markChar = titleMain.slice(0, 1) || "资";

  return (
    <div className="admin-root">
      <aside className="admin-sider" aria-label="侧边菜单">
        <div className="sider-logo">
          {logoUrl ? (
            <img className="sider-logo-img" src={logoUrl} alt="" width={40} height={40} />
          ) : (
            <span className="sider-logo-mark">{markChar}</span>
          )}
          <div>
            <div className="sider-title">{titleMain}</div>
            {titleSub ? <div className="sider-sub">{titleSub}</div> : null}
          </div>
        </div>
        <Sidebar />
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <div className="header-breadcrumb">
            <Breadcrumb />
          </div>
          <div className="header-user">
            <span className="header-welcome">
              您好，{user?.displayName ?? user?.username ?? "用户"}
            </span>
            <button
              type="button"
              className="header-logout"
              onClick={() => {
                logout();
                nav("/login", { replace: true });
              }}
            >
              退出登录
            </button>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
        <footer className="admin-footer">© {new Date().getFullYear()} 企业内部系统 · 数据请勿外传</footer>
      </div>
    </div>
  );
}

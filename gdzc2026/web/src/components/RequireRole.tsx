import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { AppRole } from "../config/menu";
import { useAuth } from "../context/AuthContext";

type Props = { roles: readonly AppRole[]; children: ReactNode };

/** 无权限时重定向到概览（与菜单可见性一致） */
export function RequireRole({ roles, children }: Props) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="page-loading">
        <div className="loading-inner">正在加载…</div>
      </div>
    );
  }
  const r = user?.role;
  if (!r || !roles.includes(r as AppRole)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}

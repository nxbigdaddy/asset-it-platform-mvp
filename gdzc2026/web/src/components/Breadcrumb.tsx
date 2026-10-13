import { Link, useLocation } from "react-router-dom";
import { getBreadcrumbs } from "../config/breadcrumbs";

export function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = getBreadcrumbs(pathname);

  return (
    <nav className="app-breadcrumb" aria-label="面包屑">
      <Link to="/app/dashboard">首页</Link>
      {segments.map((label, i) => {
        const last = i === segments.length - 1;
        return (
          <span key={`${label}-${i}`} className="app-breadcrumb-item">
            <span className="app-breadcrumb-sep">/</span>
            {last ? (
              <span className="app-breadcrumb-current">{label}</span>
            ) : (
              <span className="app-breadcrumb-muted">{label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

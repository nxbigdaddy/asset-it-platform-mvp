import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { menuForRole } from "../config/menu";
import { useAuth } from "../context/AuthContext";

export function Sidebar() {
  const { user } = useAuth();
  const menu = useMemo(() => menuForRole(user?.role), [user?.role]);

  /** 默认折叠分组，点击展开 */
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav className="side-menu" aria-label="功能菜单">
      {menu.map((g) => (
        <div key={g.id} className="side-group">
          <button
            type="button"
            className="side-group-title"
            onClick={() => setOpen((s) => ({ ...s, [g.id]: !s[g.id] }))}
            aria-expanded={Boolean(open[g.id])}
          >
            <span className="side-caret">{open[g.id] ? "▼" : "▶"}</span>
            {g.title}
          </button>
          {open[g.id] ? (
            <ul className="side-group-list">
              {g.children.map((c) => (
                <li key={c.to}>
                  <NavLink
                    end
                    to={c.to}
                    className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
                  >
                    {c.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

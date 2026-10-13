import type { ReactNode } from "react";

/** 列表页通用占位：工具栏 + 空表格 */
export function MockListBlock({
  columns,
  filterSlot,
  actions,
}: {
  columns: string[];
  filterSlot?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mock-list">
      <div className="mock-toolbar">
        <div className="mock-toolbar-left">{filterSlot ?? <MockSearch />}</div>
        <div className="mock-toolbar-right">{actions}</div>
      </div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="mock-empty-cell">
                暂无数据（功能开发中）
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mock-pagination">共 0 条 · 每页 20 条</div>
    </div>
  );
}

function MockSearch() {
  return (
    <div className="mock-filters">
      <input className="mock-input" type="search" placeholder="关键词搜索…" readOnly />
      <button type="button" className="mock-btn ghost">
        查询
      </button>
      <button type="button" className="mock-btn ghost">
        重置
      </button>
    </div>
  );
}

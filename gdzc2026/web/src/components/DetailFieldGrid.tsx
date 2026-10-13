import type { ReactNode } from "react";

export type DetailFieldRow = { label: string; value?: ReactNode };

/** 只读资产/主数据详情，替代 MockFormBlock 的假输入框 */
export function DetailFieldGrid({ rows }: { rows: DetailFieldRow[] }) {
  return (
    <dl className="detail-field-grid">
      {rows.map((r) => (
        <div key={r.label} className="detail-field-row">
          <dt>{r.label}</dt>
          <dd>{r.value !== undefined && r.value !== null && r.value !== "" ? r.value : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

type TabDef = { key: string; label: string };

/** 可切换的内容标签（与 StubBlocks 中不可点的 TabBar 区分） */
export function DetailTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="ui-tabs ui-tabs-interactive" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={`ui-tab${t.key === active ? " active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

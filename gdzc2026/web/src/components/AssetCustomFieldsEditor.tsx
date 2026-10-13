/** 资产自定义字段表单（与后端 AssetFieldDefinition 一致） */

export type AssetCustomFieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  optionsJson: string | null;
  required: boolean;
  active: boolean;
};

function parseSelectOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return [];
  try {
    const p = JSON.parse(optionsJson) as unknown;
    return Array.isArray(p) && p.every((x) => typeof x === "string") ? p : [];
  } catch {
    return [];
  }
}

type Props = {
  defs: AssetCustomFieldDef[];
  value: Record<string, unknown>;
  onChange: (key: string, next: unknown) => void;
};

export function AssetCustomFieldsEditor({ defs, value, onChange }: Props) {
  if (defs.length === 0) return null;

  return (
    <>
      {defs.map((d) => {
        const v = value[d.key];
        return (
          <div key={d.id} className="mock-form-row">
            <label>
              {d.label}
              {d.required ? " *" : ""}
            </label>
            {d.fieldType === "STRING" && (
              <input
                className="mock-input"
                value={v != null ? String(v) : ""}
                onChange={(e) => onChange(d.key, e.target.value)}
              />
            )}
            {d.fieldType === "NUMBER" && (
              <input
                type="number"
                className="mock-input"
                value={v != null && v !== "" ? String(v) : ""}
                onChange={(e) => {
                  const t = e.target.value;
                  onChange(d.key, t === "" ? "" : parseFloat(t));
                }}
              />
            )}
            {d.fieldType === "BOOLEAN" && (
              <label>
                <input
                  type="checkbox"
                  checked={v === true || v === "true" || v === 1 || v === "1"}
                  onChange={(e) => onChange(d.key, e.target.checked)}
                />{" "}
                是
              </label>
            )}
            {d.fieldType === "DATE" && (
              <input
                type="date"
                className="mock-input"
                value={v != null ? String(v).slice(0, 10) : ""}
                onChange={(e) => onChange(d.key, e.target.value)}
              />
            )}
            {d.fieldType === "SELECT" && (
              <select
                className="mock-input"
                value={v != null ? String(v) : ""}
                onChange={(e) => onChange(d.key, e.target.value)}
              >
                <option value="">—</option>
                {parseSelectOptions(d.optionsJson).map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </>
  );
}

import type { AssetFieldDefinition } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

export async function listAssetFieldDefinitions(includeInactive = false) {
  return prisma.assetFieldDefinition.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
  });
}

export async function createAssetFieldDefinition(
  input: {
    key: string;
    label: string;
    fieldType: string;
    optionsJson?: string | null;
    required?: boolean;
    sortOrder?: number;
    active?: boolean;
  },
  actor?: string,
) {
  const key = input.key.trim().replace(/\s+/g, "_");
  if (!/^[a-z][a-z0-9_]*$/i.test(key)) {
    throw new Error("字段键须为字母开头，仅含字母数字下划线");
  }
  const row = await prisma.assetFieldDefinition.create({
    data: {
      key,
      label: input.label.trim(),
      fieldType: input.fieldType,
      optionsJson: input.optionsJson ?? undefined,
      required: input.required ?? false,
      sortOrder: input.sortOrder ?? 0,
      active: input.active ?? true,
    },
  });
  await writeAudit("AssetFieldDefinition", row.id, "CREATE", { key: row.key }, actor);
  return row;
}

export async function updateAssetFieldDefinition(
  id: string,
  input: Partial<{
    label: string;
    fieldType: string;
    optionsJson: string | null;
    required: boolean;
    sortOrder: number;
    active: boolean;
  }>,
  actor?: string,
) {
  const row = await prisma.assetFieldDefinition.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.fieldType !== undefined && { fieldType: input.fieldType }),
      ...(input.optionsJson !== undefined && { optionsJson: input.optionsJson }),
      ...(input.required !== undefined && { required: input.required }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
  await writeAudit("AssetFieldDefinition", id, "UPDATE", input, actor);
  return row;
}

export async function deleteAssetFieldDefinition(id: string, actor?: string) {
  await prisma.assetFieldDefinition.delete({ where: { id } });
  await writeAudit("AssetFieldDefinition", id, "DELETE", {}, actor);
}

/** 校验并规范化自定义字段 JSON */
export function validateCustomFieldsJson(
  defs: Pick<AssetFieldDefinition, "key" | "label" | "fieldType" | "optionsJson" | "required" | "active">[],
  raw: unknown,
  mode: "create" | "update",
): Record<string, unknown> {
  const activeDefs = defs.filter((d) => d.active);
  const out: Record<string, unknown> = {};
  if (raw === null || raw === undefined) {
    for (const d of activeDefs) {
      if (d.required && mode === "create") throw new Error(`缺少自定义字段: ${d.label}`);
    }
    return out;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("customFieldsJson 须为 JSON 对象");
  }
  const obj = raw as Record<string, unknown>;
  for (const d of activeDefs) {
    const v = obj[d.key];
    if (v === undefined || v === null || v === "") {
      if (d.required && mode === "create") throw new Error(`缺少自定义字段: ${d.label}`);
      continue;
    }
    switch (d.fieldType) {
      case "STRING":
        out[d.key] = String(v);
        break;
      case "NUMBER": {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        if (Number.isNaN(n)) throw new Error(`${d.label} 须为数字`);
        out[d.key] = n;
        break;
      }
      case "BOOLEAN":
        out[d.key] = v === true || v === "true" || v === "1" || v === 1;
        break;
      case "DATE": {
        const s = String(v);
        const t = Date.parse(s);
        if (Number.isNaN(t)) throw new Error(`${d.label} 日期格式无效`);
        out[d.key] = s;
        break;
      }
      case "SELECT": {
        const opts = d.optionsJson ? (JSON.parse(d.optionsJson) as unknown) : [];
        if (!Array.isArray(opts)) throw new Error(`${d.label} 下拉选项未配置`);
        const sv = String(v);
        if (!opts.includes(sv)) throw new Error(`${d.label} 值须为: ${opts.join(", ")}`);
        out[d.key] = sv;
        break;
      }
      default:
        out[d.key] = v;
    }
  }
  return out;
}

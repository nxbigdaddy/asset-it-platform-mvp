import type { AssetStatus, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { createAsset, updateAsset } from "./assetService.js";
import {
  listAssetFieldDefinitions,
  validateCustomFieldsJson,
} from "./assetFieldDefinitionService.js";
import { writeAudit } from "./auditService.js";

const MAX_ROWS = 5000;
const MAX_BYTES = 8 * 1024 * 1024;

const FIXED_KEYS = [
  "assetNo",
  "name",
  "categoryCode",
  "locationCode",
  "orgUnitId",
  "status",
  "brand",
  "model",
  "serialNo",
  "remarks",
  "originalValue",
] as const;

const HEADER_LABELS: Record<string, string> = {
  assetNo: "资产编号",
  name: "名称",
  categoryCode: "类别编码",
  locationCode: "位置编码",
  orgUnitId: "部门ID",
  status: "状态",
  brand: "品牌",
  model: "型号",
  serialNo: "序列号",
  remarks: "备注",
  originalValue: "原值",
};

const LEGACY_SKIP_SHEETS = new Set(["目录", "总计表"]);
const LEGACY_CUSTOM_FIELDS: Array<{ key: string; label: string; fieldType: string }> = [
  { key: "device_type", label: "设备类型", fieldType: "STRING" },
  { key: "computer_name", label: "计算机名", fieldType: "STRING" },
  { key: "mac_address", label: "MAC地址", fieldType: "STRING" },
  { key: "ip_address", label: "IP地址", fieldType: "STRING" },
  { key: "department_name", label: "部门(原始)", fieldType: "STRING" },
  { key: "user_name", label: "用户(原始)", fieldType: "STRING" },
  { key: "office_port_no", label: "办公网口号", fieldType: "STRING" },
  { key: "office_position", label: "办公位置", fieldType: "STRING" },
  { key: "building_axis", label: "办公楼东西方向", fieldType: "STRING" },
  { key: "config_cpu_mem_disk", label: "配置(CPU/内存/硬盘)", fieldType: "STRING" },
  { key: "operating_system", label: "操作系统", fieldType: "STRING" },
  { key: "is_in_use", label: "是否在用", fieldType: "BOOLEAN" },
  { key: "custodian", label: "保管人", fieldType: "STRING" },
  { key: "storage_location", label: "存放地点", fieldType: "STRING" },
  { key: "inventory_qty", label: "盘点数量", fieldType: "NUMBER" },
  { key: "unit", label: "单位", fieldType: "STRING" },
  { key: "plan_implement_date", label: "计划实施时间", fieldType: "DATE" },
  { key: "actual_complete_date", label: "实际完成时间", fieldType: "DATE" },
  { key: "implementation_record", label: "实施过程记录", fieldType: "STRING" },
  { key: "sheet_name", label: "来源工作表", fieldType: "STRING" },
];

function normalizeHeader(h: string): string {
  return h.trim();
}

function pick(obj: RowObj, ...keys: string[]): string {
  for (const k of keys) {
    const v = (obj[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function toDateString(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function toNumber(v: string): number | null {
  const s = v.trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapLegacyStatus(s: string): AssetStatus | undefined {
  const v = s.trim();
  if (!v) return undefined;
  if (["是", "在用", "Y", "y", "true", "1"].includes(v)) return "IN_USE";
  if (["否", "未在用", "N", "n", "false", "0"].includes(v)) return "IDLE";
  return undefined;
}

async function ensureLegacyFieldDefinitions() {
  const maxSort = await prisma.assetFieldDefinition.aggregate({ _max: { sortOrder: true } });
  let sort = (maxSort._max.sortOrder ?? 0) + 1;
  for (const f of LEGACY_CUSTOM_FIELDS) {
    const existing = await prisma.assetFieldDefinition.findUnique({ where: { key: f.key } });
    if (existing) continue;
    await prisma.assetFieldDefinition.create({
      data: {
        key: f.key,
        label: f.label,
        fieldType: f.fieldType,
        required: false,
        active: true,
        sortOrder: sort++,
      },
    });
  }
}

function detectLegacyWorkbook(wb: XLSX.WorkBook): boolean {
  if (wb.SheetNames.includes("目录")) return true;
  return wb.SheetNames.some((name) => /台账|车间|机房|中心|设备/.test(name));
}

function parseLegacyRows(wb: XLSX.WorkBook): Array<{ sheet: string; rowNo: number; obj: RowObj }> {
  const out: Array<{ sheet: string; rowNo: number; obj: RowObj }> = [];
  for (const sheetName of wb.SheetNames) {
    if (LEGACY_SKIP_SHEETS.has(sheetName)) continue;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    if (matrix.length === 0) continue;
    let headerIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
      const row = (matrix[i] as unknown[]).map((x) => String(x ?? "").trim());
      if (row.includes("标签") || row.includes("资产标签") || row.includes("固定资产名称")) {
        headerIdx = i;
        headers = row;
        break;
      }
    }
    if (headerIdx < 0 || headers.length === 0) continue;
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = (matrix[r] as unknown[]) ?? [];
      const obj = rowToObject(headers, row);
      const marker = pick(obj, "标签", "资产标签", "固定资产名称", "SN码", "机身编号", "计算机名");
      if (!marker) continue;
      out.push({ sheet: sheetName, rowNo: r + 1, obj });
    }
  }
  return out;
}

function buildLocationCode(parentCode: string | null, name: string): string {
  const raw = `${parentCode ?? "ROOT"}::${name}`;
  const hex = Buffer.from(raw).toString("hex").slice(0, 24).toUpperCase();
  return `LOC-${hex}`;
}

async function ensureLocationByName(name: string, parentId: string | null): Promise<{ id: string; code: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("位置名称不能为空");
  const existing = await prisma.location.findFirst({
    where: { name: trimmed, parentId: parentId ?? null },
    select: { id: true, code: true },
  });
  if (existing) return existing;

  const parent = parentId
    ? await prisma.location.findUnique({ where: { id: parentId }, select: { code: true } })
    : null;
  let code = buildLocationCode(parent?.code ?? null, trimmed);
  let seq = 1;
  // 处理极小概率 hash 碰撞
  while (await prisma.location.findUnique({ where: { code } })) {
    code = `${buildLocationCode(parent?.code ?? null, trimmed)}-${seq++}`;
  }
  const row = await prisma.location.create({
    data: { code, name: trimmed, parentId: parentId ?? undefined, sortOrder: 0 },
    select: { id: true, code: true },
  });
  return row;
}

async function resolveLegacyLocationId(sheetName: string, obj: RowObj): Promise<string> {
  const parent = await ensureLocationByName(sheetName, null);
  const leafName = pick(obj, "办公位置", "存放地点");
  if (!leafName) return parent.id;
  const child = await ensureLocationByName(leafName, parent.id);
  return child.id;
}

export async function buildAssetImportTemplateBufferAsync(): Promise<Buffer> {
  const defs = await prisma.assetFieldDefinition.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const headerRow = [...FIXED_KEYS, ...defs.map((d) => `cf_${d.key}`)];
  const labelRow = [
    ...FIXED_KEYS.map((k) => HEADER_LABELS[k] ?? k),
    ...defs.map((d) => d.label),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([labelRow, headerRow]);
  XLSX.utils.book_append_sheet(wb, ws, "导入");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export async function exportAssetsToXlsxBuffer(): Promise<Buffer> {
  const defs = await prisma.assetFieldDefinition.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { category: true, location: true, orgUnit: true },
  });
  const header = [
    ...FIXED_KEYS.map((k) => HEADER_LABELS[k] ?? k),
    ...defs.map((d) => d.label),
  ];
  const keyRow = [...FIXED_KEYS, ...defs.map((d) => `cf_${d.key}`)];
  const rows: unknown[][] = [header, keyRow];
  for (const a of assets) {
    const cf =
      a.customFieldsJson && typeof a.customFieldsJson === "object" && !Array.isArray(a.customFieldsJson)
        ? (a.customFieldsJson as Record<string, unknown>)
        : {};
    const base = [
      a.assetNo,
      a.name,
      a.category.code,
      a.location?.code ?? "",
      a.orgUnitId ?? "",
      a.status,
      a.brand ?? "",
      a.model ?? "",
      a.serialNo ?? "",
      a.remarks ?? "",
      a.originalValue != null ? String(a.originalValue) : "",
    ];
    const custom = defs.map((d) => {
      const v = cf[d.key];
      return v === undefined || v === null ? "" : String(v);
    });
    rows.push([...base, ...custom]);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "资产台账");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

type RowObj = Record<string, string>;

function rowToObject(header: string[], row: unknown[]): RowObj {
  const o: RowObj = {};
  header.forEach((h, i) => {
    const k = normalizeHeader(h);
    if (!k) return;
    const v = row[i];
    o[k] = v === undefined || v === null ? "" : String(v);
  });
  return o;
}

function findHeaderRowFromMatrix(matrix: unknown[][]): { headers: string[]; dataStart: number } {
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const row = (matrix[r] as unknown[])?.map((x) => (x == null ? "" : String(x).trim())) ?? [];
    const joined = row.join("|");
    if (joined.includes("assetNo") && joined.includes("name") && joined.includes("categoryCode")) {
      return { headers: row.filter(Boolean), dataStart: r + 1 };
    }
  }
  const h0 =
    (matrix[0] as unknown[])?.map((x) => (x == null ? "" : String(x).trim()))?.filter(Boolean) ?? [];
  return { headers: h0, dataStart: 1 };
}

export async function importAssetsFromXlsx(
  buffer: Buffer,
  actor?: string,
): Promise<{ created: number; updated: number; errors: string[] }> {
  if (buffer.length > MAX_BYTES) throw new Error(`文件超过 ${MAX_BYTES / 1024 / 1024}MB`);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const isLegacy = detectLegacyWorkbook(wb);
  if (isLegacy) {
    await ensureLegacyFieldDefinitions();
  }
  const defs = await listAssetFieldDefinitions(false);
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  const legacyLocationCache = new Map<string, string>();
  const rows = isLegacy
    ? parseLegacyRows(wb).map((x) => ({ r: x.rowNo, obj: x.obj, sheetName: x.sheet }))
    : (() => {
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return [] as Array<{ r: number; obj: RowObj; sheetName: string }>;
        const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
        }) as unknown[][];
        const { headers, dataStart } = findHeaderRowFromMatrix(matrix);
        const out: Array<{ r: number; obj: RowObj; sheetName: string }> = [];
        for (let r = dataStart; r < matrix.length; r++) {
          out.push({ r: r + 1, obj: rowToObject(headers, matrix[r] as unknown[]), sheetName });
        }
        return out;
      })();

  for (const rowInfo of rows) {
    if (created + updated >= MAX_ROWS) {
      errors.push(`已处理 ${MAX_ROWS} 行，后续忽略`);
      break;
    }
    const r = rowInfo.r;
    const obj = rowInfo.obj;
    const name = isLegacy
      ? pick(obj, "固定资产名称", "设备类型", "name") || `未命名资产-${rowInfo.sheetName}-${r}`
      : (obj.name ?? "").trim();
    if (!name) continue;

    const categoryCode = isLegacy ? pick(obj, "categoryCode", "设备类型") : (obj.categoryCode ?? "").trim();
    if (!categoryCode) {
      errors.push(`第 ${r} 行：缺少类别编码`);
      continue;
    }
    let cat = await prisma.assetCategory.findUnique({ where: { code: categoryCode } });
    if (!cat && isLegacy) {
      cat = await prisma.assetCategory.findFirst({
        where: { OR: [{ name: categoryCode }, { typeCode: categoryCode }] },
      });
      if (!cat) {
        cat = await prisma.assetCategory.create({
          data: {
            code: categoryCode,
            name: categoryCode,
            typeCode: categoryCode,
            sortOrder: 999,
          },
        });
      }
    }
    if (!cat) {
      errors.push(`第 ${r} 行：类别编码不存在 ${categoryCode}`);
      continue;
    }

    let locationId: string | null = null;
    const lc = isLegacy ? pick(obj, "locationCode") : (obj.locationCode ?? "").trim();
    if (lc) {
      const loc = await prisma.location.findUnique({ where: { code: lc } });
      if (!loc) {
        errors.push(`第 ${r} 行：位置编码不存在 ${lc}`);
        continue;
      }
      locationId = loc.id;
    } else if (isLegacy) {
      const cacheKey = `${rowInfo.sheetName}::${pick(obj, "办公位置", "存放地点")}`;
      const cached = legacyLocationCache.get(cacheKey);
      if (cached) {
        locationId = cached;
      } else {
        const resolved = await resolveLegacyLocationId(rowInfo.sheetName, obj);
        locationId = resolved;
        legacyLocationCache.set(cacheKey, resolved);
      }
    }

    let orgUnitId = (obj.orgUnitId ?? "").trim() || null;
    if (!orgUnitId && isLegacy) {
      const deptName = pick(obj, "部门");
      if (deptName) {
        const first = deptName.split(/[、,，]/)[0]?.trim() ?? "";
        if (first) {
          const ou = await prisma.wxDepartment.findFirst({
            where: { OR: [{ name: first }, { shortCode: first }] },
          });
          orgUnitId = ou?.id ?? null;
        }
      }
    }
    if (orgUnitId) {
      const ou = await prisma.wxDepartment.findUnique({ where: { id: orgUnitId } });
      if (!ou) {
        errors.push(`第 ${r} 行：部门 ID 不存在 ${orgUnitId}`);
        continue;
      }
    }

    let status: AssetStatus | undefined;
    const st = isLegacy ? pick(obj, "status", "是否在用") : (obj.status ?? "").trim();
    if (st) {
      const allowed = new Set<AssetStatus>([
        "PENDING_CAPITALIZATION",
        "IN_USE",
        "IDLE",
        "UNDER_REPAIR",
        "DISPOSED",
        "PLANNED",
        "IN_TRANSIT",
        "SEALED",
        "PENDING_DISPOSAL",
      ]);
      const mapped = isLegacy ? mapLegacyStatus(st) ?? (st as AssetStatus) : (st as AssetStatus);
      if (!allowed.has(mapped)) {
        errors.push(`第 ${r} 行：无效状态 ${st}`);
        continue;
      }
      status = mapped;
    }

    const customRaw: Record<string, unknown> = {};
    for (const d of defs) {
      const col = `cf_${d.key}`;
      if (obj[col] !== undefined && String(obj[col]).trim() !== "") {
        customRaw[d.key] = obj[col];
      }
    }
    if (isLegacy) {
      customRaw.device_type = pick(obj, "设备类型");
      customRaw.computer_name = pick(obj, "计算机名");
      customRaw.mac_address = pick(obj, "MAC地址");
      customRaw.ip_address = pick(obj, "IP地址");
      customRaw.department_name = pick(obj, "部门");
      customRaw.user_name = pick(obj, "用户");
      customRaw.office_port_no = pick(obj, "办公网口号");
      customRaw.office_position = pick(obj, "办公位置");
      customRaw.building_axis = pick(obj, "办公楼东西方向");
      customRaw.config_cpu_mem_disk = pick(obj, "配置(CPU/内存/硬盘)", "配置(CPU/内存/硬盘）", "配置");
      customRaw.operating_system = pick(obj, "操作系统");
      customRaw.custodian = pick(obj, "保管人");
      customRaw.storage_location = pick(obj, "存放地点");
      customRaw.unit = pick(obj, "单位");
      customRaw.implementation_record = pick(obj, "实施过程记录");
      customRaw.sheet_name = rowInfo.sheetName;
      const inUse = mapLegacyStatus(pick(obj, "是否在用"));
      if (inUse !== undefined) customRaw.is_in_use = inUse === "IN_USE";
      const qty = toNumber(pick(obj, "盘点数量"));
      if (qty !== null) customRaw.inventory_qty = qty;
      const planDate = toDateString(pick(obj, "计划实施时间"));
      if (planDate) customRaw.plan_implement_date = planDate;
      const doneDate = toDateString(pick(obj, "实际完成时间", "启用时间", "启用日期"));
      if (doneDate) customRaw.actual_complete_date = doneDate;
    }

    const assetNo = isLegacy ? pick(obj, "assetNo", "标签", "资产标签") : (obj.assetNo ?? "").trim();
    const existing = assetNo ? await prisma.asset.findUnique({ where: { assetNo } }) : null;

    let customJson: Record<string, unknown>;
    try {
      const prev =
        existing?.customFieldsJson &&
        typeof existing.customFieldsJson === "object" &&
        !Array.isArray(existing.customFieldsJson)
          ? { ...(existing.customFieldsJson as Record<string, unknown>) }
          : {};
      const merged = { ...prev, ...customRaw };
      customJson = validateCustomFieldsJson(defs, merged, existing ? "update" : "create");
    } catch (e) {
      errors.push(`第 ${r} 行：${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    try {
      if (existing) {
        await updateAsset(
          existing.id,
          {
            name,
            categoryId: cat.id,
            locationId,
            orgUnitId,
            ...(status && { status }),
            brand: pick(obj, "brand", "品牌") || null,
            model: pick(obj, "model", "具体型号", "固定资产型号", "型号") || null,
            serialNo: pick(obj, "serialNo", "SN码", "机身编号") || null,
            remarks: pick(obj, "remarks", "备注") || null,
            originalValue: pick(obj, "originalValue", "资产原值（含税）") || null,
            customFieldsJson: customJson as Prisma.InputJsonValue,
          },
          actor,
        );
        updated++;
      } else {
        await createAsset({
          name,
          categoryId: cat.id,
          locationId,
          orgUnitId,
          status,
          brand: pick(obj, "brand", "品牌") || null,
          model: pick(obj, "model", "具体型号", "固定资产型号", "型号") || null,
          serialNo: pick(obj, "serialNo", "SN码", "机身编号") || null,
          remarks: pick(obj, "remarks", "备注") || null,
          originalValue: pick(obj, "originalValue", "资产原值（含税）") || null,
          customFieldsJson: customJson as Prisma.InputJsonValue,
          assetNoOverride: assetNo || undefined,
        });
        created++;
      }
    } catch (e) {
      errors.push(`第 ${r} 行：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await writeAudit("Asset", "import", "EXCEL_IMPORT", { created, updated, errorCount: errors.length }, actor);
  return { created, updated, errors };
}

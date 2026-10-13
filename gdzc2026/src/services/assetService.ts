import fs from "node:fs";
import { Prisma, type AssetStatus } from "@prisma/client";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { attachmentDir } from "../lib/uploadPaths.js";
import { prisma } from "../lib/prisma.js";
import { assetWhereForOrgScope } from "./dataScopeService.js";
import { writeAudit } from "./auditService.js";
import { generateHostname, renderHostnameTemplate } from "./namingService.js";
import { allocateIp, bindIpToAsset, suggestNextFreeIp } from "./ipamService.js";

function nextAssetNo(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FA-${t}-${r}`;
}

export type CreateAssetInput = {
  name: string;
  categoryId: string;
  locationId?: string | null;
  orgUnitId?: string | null;
  status?: AssetStatus;
  brand?: string | null;
  model?: string | null;
  serialNo?: string | null;
  costCenterId?: string | null;
  ledgerBookId?: string | null;
  originalValue?: string | null;
  remarks?: string | null;
  namingPolicyId?: string | null;
  generateHostname?: boolean;
  subnetId?: string | null;
  autoIp?: boolean;
  ipAddress?: string | null;
  assignUserid?: string | null;
  assignmentPurpose?: string | null;
  /** 记录 IP 分配日志等 */
  actorUserId?: string | null;
  customFieldsJson?: InputJsonValue | null;
  /** 导入时指定资产编号（须唯一） */
  assetNoOverride?: string | null;
};

export async function createAsset(input: CreateAssetInput) {
  const category = await prisma.assetCategory.findUniqueOrThrow({
    where: { id: input.categoryId },
  });

  let orgUnit = input.orgUnitId
    ? await prisma.wxDepartment.findUnique({ where: { id: input.orgUnitId } })
    : null;

  let policyId = input.namingPolicyId;
  if (!policyId && input.generateHostname) {
    const def = await prisma.namingPolicy.findFirst({
      where: {
        OR: [{ categoryId: category.id, isDefault: true }, { isDefault: true }],
      },
      orderBy: [{ categoryId: "desc" }],
    });
    policyId = def?.id ?? null;
  }

  let hostname: string | null = null;
  let namingPolicyId: string | null = policyId ?? null;

  if (input.generateHostname && policyId) {
    const site = (
      await prisma.namingPolicy.findUnique({ where: { id: policyId } })
    )?.siteCode ?? "A";
    const dept = orgUnit?.shortCode ?? orgUnit?.id?.slice(0, 6) ?? "NA";
    const type = category.typeCode ?? category.code;

    const result = await prisma.$transaction(async (tx) => {
      return generateHostname(tx, policyId!, input.orgUnitId ?? null, category.id, {
        site,
        dept,
        type,
      });
    });
    hostname = result.hostname;
  }

  let assetNo = nextAssetNo();
  const override = input.assetNoOverride?.trim();
  if (override) {
    const dup = await prisma.asset.findUnique({ where: { assetNo: override } });
    if (dup) throw new Error(`资产编号已存在: ${override}`);
    assetNo = override;
  }

  const asset = await prisma.asset.create({
    data: {
      assetNo,
      name: input.name,
      categoryId: input.categoryId,
      locationId: input.locationId ?? undefined,
      orgUnitId: input.orgUnitId ?? undefined,
      status: input.status ?? "PENDING_CAPITALIZATION",
      brand: input.brand ?? undefined,
      model: input.model ?? undefined,
      serialNo: input.serialNo ?? undefined,
      costCenterId: input.costCenterId ?? undefined,
      ledgerBookId: input.ledgerBookId ?? undefined,
      originalValue: input.originalValue ?? undefined,
      remarks: input.remarks ?? undefined,
      hostnameGenerated: hostname ?? undefined,
      namingPolicyId: namingPolicyId ?? undefined,
      ...(input.customFieldsJson !== undefined && input.customFieldsJson !== null
        ? { customFieldsJson: input.customFieldsJson as Prisma.InputJsonValue }
        : {}),
    },
  });

  if (input.assignUserid) {
    const user = await prisma.wxUser.findUnique({
      where: { userid: input.assignUserid },
    });
    if (!user) throw new Error(`企业微信用户不存在: ${input.assignUserid}`);
    await prisma.assetAssignment.create({
      data: {
        assetId: asset.id,
        wxUserId: user.id,
        purpose: input.assignmentPurpose ?? undefined,
        status: "ACTIVE",
      },
    });
  }

  if (input.subnetId) {
    const addr =
      input.ipAddress ??
      (input.autoIp ? (await suggestNextFreeIp(input.subnetId)) : null);
    if (!addr) throw new Error("未指定 IP 且无法自动分配");
    const { id: ipId } = await allocateIp(input.subnetId, addr, "ALLOCATED");
    await bindIpToAsset(asset.id, ipId, "data", undefined, {
      actorUserId: input.actorUserId ?? undefined,
    });
  }

  await writeAudit("Asset", asset.id, "CREATE", { input: { ...input, originalValue: undefined } });
  return prisma.asset.findUniqueOrThrow({
    where: { id: asset.id },
    include: {
      category: true,
      orgUnit: true,
      assignments: { include: { wxUser: true } },
      ipBindings: { include: { ipAddress: true } },
    },
  });
}

export async function findAssetByAssetNo(assetNo: string) {
  return prisma.asset.findUnique({
    where: { assetNo },
    select: { id: true, assetNo: true, name: true, status: true, orgUnitId: true },
  });
}

export async function getAssetById(id: string) {
  return prisma.asset.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      orgUnit: true,
      costCenter: true,
      ledgerBook: true,
      namingPolicy: true,
      assignments: { include: { wxUser: true } },
      ipBindings: { include: { ipAddress: { include: { subnet: true } } } },
      erpRefs: true,
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getAssetByIdForUser(id: string, userId: string) {
  const asset = await getAssetById(id);
  if (!asset) return null;
  const { assertUserCanViewAsset } = await import("./dataScopeService.js");
  try {
    await assertUserCanViewAsset(userId, asset.orgUnitId);
  } catch {
    return null;
  }
  return asset;
}

export type UpdateAssetInput = {
  name?: string;
  categoryId?: string;
  locationId?: string | null;
  orgUnitId?: string | null;
  status?: AssetStatus;
  remarks?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNo?: string | null;
  costCenterId?: string | null;
  ledgerBookId?: string | null;
  originalValue?: string | null;
  salvageValue?: string | null;
  depreciationMonths?: number | null;
  inServiceDate?: Date | null;
  customFieldsJson?: InputJsonValue | null;
};

export async function updateAsset(id: string, input: UpdateAssetInput, actor?: string) {
  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.locationId !== undefined && { locationId: input.locationId ?? undefined }),
      ...(input.orgUnitId !== undefined && { orgUnitId: input.orgUnitId ?? undefined }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.remarks !== undefined && { remarks: input.remarks ?? undefined }),
      ...(input.brand !== undefined && { brand: input.brand ?? undefined }),
      ...(input.model !== undefined && { model: input.model ?? undefined }),
      ...(input.serialNo !== undefined && { serialNo: input.serialNo ?? undefined }),
      ...(input.costCenterId !== undefined && { costCenterId: input.costCenterId ?? undefined }),
      ...(input.ledgerBookId !== undefined && { ledgerBookId: input.ledgerBookId ?? undefined }),
      ...(input.originalValue !== undefined && { originalValue: input.originalValue ?? undefined }),
      ...(input.salvageValue !== undefined && { salvageValue: input.salvageValue ?? undefined }),
      ...(input.depreciationMonths !== undefined && {
        depreciationMonths: input.depreciationMonths ?? undefined,
      }),
      ...(input.inServiceDate !== undefined && {
        inServiceDate: input.inServiceDate ?? undefined,
      }),
      ...(input.customFieldsJson !== undefined && {
        customFieldsJson:
          input.customFieldsJson === null ? Prisma.JsonNull : (input.customFieldsJson as Prisma.InputJsonValue),
      }),
    },
    include: {
      category: true,
      location: true,
      orgUnit: true,
      assignments: { where: { status: "ACTIVE" }, include: { wxUser: true } },
      ipBindings: { include: { ipAddress: true } },
    },
  });
  await writeAudit("Asset", id, "UPDATE", { input }, actor);
  return asset;
}

/**
 * 物理删除资产：先解除/删除无外键级联的关联（调拨单、处置单、盘点行等），再删卡片并清理附件目录。
 */
export async function deleteAsset(id: string, actor?: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw new Error("资产不存在");

  const snapshot = { assetNo: asset.assetNo, name: asset.name };

  await prisma.$transaction(async (tx) => {
    await tx.transferOrder.deleteMany({ where: { assetId: id } });
    await tx.disposalOrder.deleteMany({ where: { assetId: id } });
    await tx.inventoryLine.deleteMany({ where: { assetId: id } });
    await tx.softwareLicense.updateMany({
      where: { assetId: id },
      data: { assetId: null },
    });
    await tx.procurementRequest.updateMany({
      where: { relatedAssetId: id },
      data: { relatedAssetId: null },
    });
    await tx.asset.delete({ where: { id } });
  });

  try {
    fs.rmSync(attachmentDir(id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  await writeAudit("Asset", id, "DELETE", snapshot, actor);
  return snapshot;
}

export async function listAssets(params: {
  skip?: number;
  take?: number;
  status?: AssetStatus;
  orgUnitId?: string;
  /** 数据范围：null 表示不按部门过滤 */
  scopeOrgUnitIds?: string[] | null;
}) {
  const scopePart = assetWhereForOrgScope(params.scopeOrgUnitIds ?? null);
  const where: Prisma.AssetWhereInput = {
    ...scopePart,
    ...(params.status && { status: params.status }),
    ...(params.orgUnitId && { orgUnitId: params.orgUnitId }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.asset.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        orgUnit: true,
        assignments: { where: { status: "ACTIVE" }, include: { wxUser: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);
  return { items, total };
}

export async function previewHostname(
  policyId: string,
  orgUnitId: string | null,
  categoryId: string,
  seq: number,
) {
  const policy = await prisma.namingPolicy.findUniqueOrThrow({ where: { id: policyId } });
  const org = orgUnitId
    ? await prisma.wxDepartment.findUnique({ where: { id: orgUnitId } })
    : null;
  const cat = await prisma.assetCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const site = policy.siteCode ?? "A";
  const dept = org?.shortCode ?? org?.id?.slice(0, 6) ?? "NA";
  const type = cat.typeCode ?? cat.code;
  return renderHostnameTemplate(policy.template, { site, dept, type }, seq);
}

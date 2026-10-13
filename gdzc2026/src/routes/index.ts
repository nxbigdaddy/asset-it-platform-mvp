import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { UPLOAD_ROOT } from "../lib/uploadPaths.js";
import { assertAdmin, assertNotViewer } from "../lib/permissions.js";
import { getUserById, loginUser } from "../services/authService.js";
import {
  createAsset,
  deleteAsset,
  findAssetByAssetNo,
  getAssetByIdForUser,
  listAssets,
  previewHostname,
  updateAsset,
} from "../services/assetService.js";
import { assertUserCanViewAsset, getOrgScopeIdsForUser } from "../services/dataScopeService.js";
import {
  findAssignmentsForDepartedUsers,
  syncDepartments,
  syncUsers,
} from "../services/wxSyncService.js";
import { isWeworkRemoteConfigured, pullRemoteWxSync } from "../services/weworkRemoteSync.js";
import { allocateIp, suggestNextFreeIp } from "../services/ipamService.js";
import { enqueueErpSync, processPendingErpQueue, registerErpAssetRef } from "../services/erpService.js";
import type { AssetStatus, Prisma } from "@prisma/client";
import {
  approveDisposalOrder,
  createDisposalOrder,
  listDisposalOrders,
  rejectDisposalOrder,
  submitDisposalOrder,
} from "../services/disposalService.js";
import {
  addInventoryLines,
  addInventoryLinesByAssetNo,
  cancelInventoryTask,
  completeInventoryTask,
  createInventoryTask,
  getInventoryTask,
  listInventoryTasks,
  recordInventoryCount,
  startInventoryTask,
} from "../services/inventoryService.js";
import {
  approveTransferOrder,
  createTransferOrder,
  listTransferOrders,
  rejectTransferOrder,
  submitTransferOrder,
} from "../services/transferService.js";
import {
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  updateCategory,
  updateLocation,
} from "../services/masterDataService.js";
import {
  createNamingPolicy,
  deleteNamingPolicy,
  updateNamingPolicy,
} from "../services/namingPolicyAdminService.js";
import { createUser, listRoles, listUsers, updateUser } from "../services/userAdminService.js";
import {
  createProcurementRequest,
  listProcurementRequests,
  updateProcurementStatus,
} from "../services/procurementService.js";
import {
  financeCardSummary,
  listDepreciationRuns,
  postDepreciationRun,
  runDepreciationForPeriod,
} from "../services/depreciationService.js";
import {
  createSoftwareLicense,
  deleteSoftwareLicense,
  listSoftwareLicenses,
  updateSoftwareLicense,
} from "../services/softwareLicenseService.js";
import { assetSummaryReport } from "../services/reportsService.js";
import { getSettingValue, listSettings, upsertSetting } from "../services/systemSettingsService.js";
import { getSyncOverview } from "../services/syncLogService.js";
import { listMaintenance, listMolds, upsertMaintenance, upsertMold } from "../services/mfgService.js";
import { getRequiredDisposalSteps, getRequiredTransferSteps } from "../services/approvalSettingsService.js";
import {
  deleteAttachment,
  listAttachments,
  resolveAttachmentFile,
  saveAttachment,
} from "../services/attachmentService.js";
import { createExportJob, getExportFileAbsolutePath, listExportJobs } from "../services/exportJobService.js";
import { registerServerManagementRoutes } from "./serverManagementRoutes.js";
import {
  createAssetFieldDefinition,
  deleteAssetFieldDefinition,
  listAssetFieldDefinitions,
  updateAssetFieldDefinition,
  validateCustomFieldsJson,
} from "../services/assetFieldDefinitionService.js";
import {
  buildAssetImportTemplateBufferAsync,
  exportAssetsToXlsxBuffer,
  importAssetsFromXlsx,
} from "../services/assetExcelService.js";

const createAssetBody = z.object({
  name: z.string().min(1),
  categoryId: z.string(),
  locationId: z.string().optional().nullable(),
  orgUnitId: z.string().optional().nullable(),
  status: z.string().optional(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNo: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  ledgerBookId: z.string().optional().nullable(),
  originalValue: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  namingPolicyId: z.string().optional().nullable(),
  generateHostname: z.boolean().optional(),
  subnetId: z.string().optional().nullable(),
  autoIp: z.boolean().optional(),
  ipAddress: z.string().optional().nullable(),
  assignUserid: z.string().optional().nullable(),
  assignmentPurpose: z.string().optional().nullable(),
  /** 导入或手工指定资产编号（须唯一） */
  assetNoOverride: z.string().optional().nullable(),
  customFieldsJson: z.record(z.unknown()).optional().nullable(),
});

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/public/branding", async () => {
    const companyName = (await getSettingValue("company.name")) ?? "";
    const appTitle = (await getSettingValue("app.title")) ?? "资产与终端一体化平台";
    const logoUrl = (await getSettingValue("company.logo")) ?? "";
    return {
      companyName,
      appTitle,
      logoUrl: logoUrl.trim(),
    };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const b = z
      .object({
        username: z.string().min(1),
        password: YOUR_PASSWORD).min(1),
      })
      .parse(req.body);
    try {
      const out = await loginUser(b.username, b.password);
      return reply.send(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "登录失败";
      return reply.status(401).send({ error: msg });
    }
  });

  app.get("/api/auth/me", async (req, reply) => {
    const id = req.authUser?.id;
    if (!id) {
      return reply.status(401).send({ error: "未登录" });
    }
    const u = await getUserById(id);
    if (!u) {
      return reply.status(404).send({ error: "用户不存在" });
    }
    return u;
  });

  app.get("/api/categories", async () => {
    return prisma.assetCategory.findMany({
      orderBy: [{ sortOrder: "asc" }],
    });
  });

  app.post("/api/categories", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        parentId: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
        typeCode: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      const row = await createCategory({
        ...b,
        actor: req.authUser?.username,
      });
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/categories/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        name: z.string().optional(),
        sortOrder: z.number().optional(),
        typeCode: z.string().optional().nullable(),
        parentId: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      return await updateCategory(id, b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/categories/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteCategory(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/locations", async () => {
    return prisma.location.findMany({ orderBy: [{ sortOrder: "asc" }] });
  });

  app.get("/api/cost-centers", async () => prisma.costCenter.findMany({ orderBy: { code: "asc" } }));

  app.get("/api/ledger-books", async () => prisma.ledgerBook.findMany({ orderBy: { code: "asc" } }));

  app.post("/api/locations", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        parentId: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
      })
      .parse(req.body);
    try {
      const row = await createLocation({
        ...b,
        actor: req.authUser?.username,
      });
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/locations/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        name: z.string().optional(),
        sortOrder: z.number().optional(),
        parentId: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      return await updateLocation(id, b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/locations/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteLocation(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/wx/departments", async () => {
    return prisma.wxDepartment.findMany({ orderBy: [{ order: "asc" }] });
  });

  app.get("/api/wx/users", async () => {
    return prisma.wxUser.findMany({
      include: { departments: { include: { department: true } } },
    });
  });

  app.post("/api/wx/sync/departments", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const body = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          parentid: z.union([z.number(), z.string()]).optional(),
          order: z.number().optional(),
        }),
      )
      .parse(req.body);
    return syncDepartments(
      body.map((d) => ({
        ...d,
        parentid: d.parentid,
      })),
    );
  });

  app.post("/api/wx/sync/users", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const body = z
      .array(
        z.object({
          userid: z.string(),
          name: z.string(),
          department: z.array(z.number()),
          mobile: z.string().optional(),
          email: z.string().optional(),
          position: z.string().optional(),
          status: z.number().optional(),
        }),
      )
      .parse(req.body);
    return syncUsers(body);
  });

  /** 使用服务端环境变量中的 corpid + secret 调用企微 API 全量拉取部门与成员（需外网）。 */
  app.post("/api/wx/sync/from-remote", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    if (!(await isWeworkRemoteConfigured())) {
      return reply.status(400).send({ error: "未配置 WEWORK_CORP_ID / WEWORK_CORP_SECRET" });
    }
    try {
      return await pullRemoteWxSync();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "拉取失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/wx/departed-assignments", async () => {
    return findAssignmentsForDepartedUsers();
  });

  app.get("/api/assets/lookup", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const assetNo = q.assetNo?.trim();
    if (!assetNo) return reply.status(400).send({ error: "缺少 assetNo" });
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const row = await findAssetByAssetNo(assetNo);
    if (!row) return reply.status(404).send({ error: "未找到该资产编号" });
    try {
      await assertUserCanViewAsset(uid, row.orgUnitId);
    } catch {
      return reply.status(403).send({ error: "无权查看" });
    }
    return row;
  });

  /** 列表/创建须注册在 /api/assets/:id 之前，否则部分环境下 /api/assets 可能被参数路由误吞 */
  app.get("/api/assets", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const skip = q.skip ? parseInt(q.skip, 10) : 0;
    const take = q.take ? parseInt(q.take, 10) : 50;
    const status = q.status as AssetStatus | undefined;
    const orgUnitId = q.orgUnitId;
    const uid = req.authUser?.id;
    const scopeOrgUnitIds = uid ? await getOrgScopeIdsForUser(uid) : null;
    return listAssets({ skip, take, status, orgUnitId, scopeOrgUnitIds });
  });

  app.post("/api/assets", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const raw = createAssetBody.parse(req.body);
    const defs = await listAssetFieldDefinitions(false);
    const normalizedCf = validateCustomFieldsJson(defs, raw.customFieldsJson ?? {}, "create");
    const { customFieldsJson: _cfRaw, ...rest } = raw;
    const asset = await createAsset({
      ...rest,
      status: raw.status as AssetStatus | undefined,
      actorUserId: req.authUser?.id ?? null,
      customFieldsJson: Object.keys(normalizedCf).length
        ? (normalizedCf as Prisma.InputJsonValue)
        : undefined,
    });
    await enqueueErpSync("ASSET_CARD", asset.id, {
      event: "ASSET_CREATED",
      assetNo: asset.assetNo,
    });
    return reply.code(201).send(asset);
  });

  app.get("/api/assets/export.xlsx", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const buf = await exportAssetsToXlsxBuffer();
    return reply
      .header("Content-Disposition", `attachment; filename="assets-export.xlsx"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buf);
  });

  app.get("/api/assets/import-template.xlsx", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const buf = await buildAssetImportTemplateBufferAsync();
    return reply
      .header("Content-Disposition", `attachment; filename="assets-import-template.xlsx"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buf);
  });

  app.post("/api/assets/import", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "未上传文件" });
    const buf = await data.toBuffer();
    try {
      const result = await importAssetsFromXlsx(buf, req.authUser?.username);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导入失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/assets/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const asset = await getAssetByIdForUser(id, uid);
    if (!asset) return reply.status(404).send({ error: "资产不存在或无权查看" });
    return asset;
  });

  app.get("/api/assets/:assetId/attachments", async (req, reply) => {
    const assetId = (req.params as { assetId: string }).assetId;
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return reply.status(404).send({ error: "资产不存在" });
    try {
      await assertUserCanViewAsset(uid, asset.orgUnitId);
    } catch {
      return reply.status(403).send({ error: "无权查看" });
    }
    return listAttachments(assetId);
  });

  app.post("/api/assets/:assetId/attachments", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const assetId = (req.params as { assetId: string }).assetId;
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const a = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!a) return reply.status(404).send({ error: "资产不存在" });
    try {
      await assertUserCanViewAsset(uid, a.orgUnitId);
    } catch {
      return reply.status(403).send({ error: "无权上传" });
    }
    try {
      const data = await req.file();
      if (!data) return reply.status(400).send({ error: "未上传文件" });
      const buf = await data.toBuffer();
      const row = await saveAttachment(
        assetId,
        buf,
        data.filename,
        data.mimetype,
        req.authUser?.id,
        req.authUser?.username,
      );
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "上传失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/attachments/:id/download", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = await prisma.assetAttachment.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "附件不存在" });
    const full = resolveAttachmentFile(row.assetId, row.storedName);
    if (!fs.existsSync(full)) return reply.status(404).send({ error: "文件已丢失" });
    const encoded = encodeURIComponent(row.originalName);
    return reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`)
      .type(row.mimeType || "application/octet-stream")
      .send(fs.createReadStream(full));
  });

  app.delete("/api/attachments/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteAttachment(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/export-jobs", async () => listExportJobs());

  app.post("/api/export-jobs", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z.object({ type: z.enum(["ASSET_CSV", "AUDIT_CSV"]) }).parse(req.body);
    try {
      const row = await createExportJob(b.type, req.authUser?.id ?? null, req.authUser?.username);
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/export-jobs/:id/download", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = await prisma.exportJob.findUnique({ where: { id } });
    if (!job || job.status !== "DONE") {
      return reply.status(404).send({ error: "导出未完成或不存在" });
    }
    const file = getExportFileAbsolutePath(id);
    if (!fs.existsSync(file)) return reply.status(404).send({ error: "文件不存在" });
    const name = job.fileName ?? `export-${id.slice(0, 8)}.csv`;
    return reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
      .type("text/csv; charset=utf-8")
      .send(fs.createReadStream(file));
  });

  app.patch("/api/assets/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "资产不存在" });
    try {
      await assertUserCanViewAsset(uid, existing.orgUnitId);
    } catch {
      return reply.status(403).send({ error: "无权修改" });
    }
    const b = z
      .object({
        name: z.string().optional(),
        categoryId: z.string().optional(),
        locationId: z.string().optional().nullable(),
        orgUnitId: z.string().optional().nullable(),
        status: z.string().optional(),
        remarks: z.string().optional().nullable(),
        brand: z.string().optional().nullable(),
        model: z.string().optional().nullable(),
        serialNo: z.string().optional().nullable(),
        costCenterId: z.string().optional().nullable(),
        ledgerBookId: z.string().optional().nullable(),
        originalValue: z.string().optional().nullable(),
        salvageValue: z.string().optional().nullable(),
        depreciationMonths: z.number().optional().nullable(),
        inServiceDate: z.string().datetime().optional().nullable(),
        customFieldsJson: z.record(z.unknown()).optional().nullable(),
      })
      .parse(req.body);
    try {
      const defs = await listAssetFieldDefinitions(false);
      let customPayload: Record<string, unknown> | null | undefined;
      if (b.customFieldsJson === null) {
        customPayload = null;
      } else if (b.customFieldsJson !== undefined) {
        const prev =
          existing.customFieldsJson &&
          typeof existing.customFieldsJson === "object" &&
          !Array.isArray(existing.customFieldsJson)
            ? { ...(existing.customFieldsJson as Record<string, unknown>) }
            : {};
        const merged = { ...prev, ...b.customFieldsJson };
        customPayload = validateCustomFieldsJson(defs, merged, "update");
      } else {
        customPayload = undefined;
      }
      const { customFieldsJson: _cj, ...rest } = b;
      const asset = await updateAsset(
        id,
        {
          ...rest,
          status: b.status as AssetStatus | undefined,
          inServiceDate: b.inServiceDate ? new Date(b.inServiceDate) : b.inServiceDate === null ? null : undefined,
          ...(customPayload !== undefined && {
            customFieldsJson:
              customPayload === null ? null : (customPayload as Prisma.InputJsonValue),
          }),
        },
        req.authUser?.username,
      );
      return asset;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/assets/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const uid = req.authUser?.id;
    if (!uid) return reply.status(401).send({ error: "未登录" });
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "资产不存在" });
    try {
      await assertUserCanViewAsset(uid, existing.orgUnitId);
    } catch {
      return reply.status(403).send({ error: "无权删除" });
    }
    try {
      await deleteAsset(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
    try {
      await enqueueErpSync("ASSET_CARD", id, {
        event: "ASSET_DELETED",
        assetNo: existing.assetNo,
      });
    } catch {
      /* 删除已成功，ERP 队列入库失败不阻断 */
    }
    return reply.code(204).send();
  });

  app.post("/api/naming/preview", async (req) => {
    const b = z
      .object({
        policyId: z.string(),
        orgUnitId: z.string().nullable().optional(),
        categoryId: z.string(),
        seq: z.number().int().min(1),
      })
      .parse(req.body);
    const hostname = await previewHostname(
      b.policyId,
      b.orgUnitId ?? null,
      b.categoryId,
      b.seq,
    );
    return { hostname };
  });

  app.get("/api/subnets", async () => prisma.subnet.findMany());

  app.post("/api/subnets", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        cidr: z.string(),
        vlanId: z.string().optional().nullable(),
        purpose: z
          .enum(["OFFICE", "PRODUCTION", "SERVER", "MANAGEMENT", "GUEST", "OTHER"])
          .optional(),
        gateway: z.string().optional().nullable(),
        dns: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    const s = await prisma.subnet.create({ data: b });
    return reply.code(201).send(s);
  });

  app.get("/api/subnets/:id/suggest-ip", async (req) => {
    const id = (req.params as { id: string }).id;
    const ip = await suggestNextFreeIp(id);
    return { subnetId: id, suggestedIp: ip };
  });

  app.post("/api/ip/allocate", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        subnetId: z.string(),
        address: z.string(),
      })
      .parse(req.body);
    return allocateIp(b.subnetId, b.address, "ALLOCATED");
  });

  app.get("/api/ip-allocation-logs", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const take = q.take ? parseInt(q.take, 10) : 200;
    return prisma.ipAllocationLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: {
        asset: { select: { id: true, assetNo: true, name: true } },
        ipAddress: { include: { subnet: true } },
      },
    });
  });

  app.get("/api/erp/queue", async () => {
    return prisma.erpSyncQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post("/api/erp/queue/process", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    return processPendingErpQueue();
  });

  app.post("/api/erp/asset-ref", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        assetId: z.string(),
        erpAssetId: z.string(),
        erpBook: z.string().optional(),
      })
      .parse(req.body);
    await registerErpAssetRef(b.assetId, b.erpAssetId, b.erpBook);
    return reply.code(204).send();
  });

  app.get("/api/naming-policies", async () => prisma.namingPolicy.findMany());

  app.post("/api/naming-policies", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        name: z.string().min(1),
        template: z.string().min(1),
        scopeType: z.string().min(1),
        categoryId: z.string().optional().nullable(),
        siteCode: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      })
      .parse(req.body);
    const row = await createNamingPolicy({ ...b, actor: req.authUser?.username });
    return reply.code(201).send(row);
  });

  app.patch("/api/naming-policies/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        name: z.string().optional(),
        template: z.string().optional(),
        scopeType: z.string().optional(),
        categoryId: z.string().optional().nullable(),
        siteCode: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      })
      .parse(req.body);
    return updateNamingPolicy(id, b, req.authUser?.username);
  });

  app.delete("/api/naming-policies/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteNamingPolicy(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/audit-logs", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const take = q.take ? parseInt(q.take, 10) : 100;
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });
  });

  app.get("/api/users/roles", async () => listRoles());

  app.get("/api/users", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    return listUsers();
  });

  app.post("/api/users", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        username: z.string().min(1),
        password: YOUR_PASSWORD).min(4),
        displayName: z.string().optional().nullable(),
        role: z.enum(["admin", "operator", "viewer"]).optional(),
        orgScopeJson: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      const row = await createUser({ ...b, actor: req.authUser?.username });
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/users/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        displayName: z.string().optional().nullable(),
        role: z.enum(["admin", "operator", "viewer"]).optional(),
        isActive: z.boolean().optional(),
        password: YOUR_PASSWORD).min(4).optional(),
        orgScopeJson: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      return await updateUser(id, b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/system/approval-config", async () => ({
    transferSteps: await getRequiredTransferSteps(),
    disposalSteps: await getRequiredDisposalSteps(),
  }));

  app.get("/api/system/settings", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    return listSettings();
  });

  app.put("/api/system/settings/:key", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const key = (req.params as { key: string }).key;
    const b = z.object({ value: z.string(), note: z.string().optional().nullable() }).parse(req.body);
    return upsertSetting(key, b.value, b.note, req.authUser?.username);
  });

  app.put("/api/system/settings/batch", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        entries: z.array(z.object({ key: z.string(), value: z.string(), note: z.string().optional().nullable() })),
      })
      .parse(req.body);
    for (const e of b.entries) {
      await upsertSetting(e.key, e.value, e.note ?? null, req.authUser?.username);
    }
    return { ok: true };
  });

  app.post("/api/system/branding/logo", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "未上传文件" });
    const buf = await data.toBuffer();
    if (buf.length > 2 * 1024 * 1024) {
      return reply.status(400).send({ error: "图片须小于 2MB" });
    }
    const mime = (data.mimetype ?? "").toLowerCase();
    let ext: string;
    if (mime.includes("png")) ext = "png";
    else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("webp")) ext = "webp";
    else if (mime.includes("gif")) ext = "gif";
    else return reply.status(400).send({ error: "仅支持 png、jpg、webp、gif" });
    const dir = path.join(UPLOAD_ROOT, "branding");
    fs.mkdirSync(dir, { recursive: true });
    for (const e of ["png", "jpg", "webp", "gif"] as const) {
      const p = path.join(dir, `company-logo.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const fileName = `company-logo.${ext}`;
    fs.writeFileSync(path.join(dir, fileName), buf);
    const publicPath = `/uploads/branding/${fileName}`;
    await upsertSetting("company.logo", publicPath, "企业 Logo", req.authUser?.username);
    return { logoUrl: publicPath };
  });

  app.delete("/api/system/branding/logo", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const prev = await getSettingValue("company.logo");
    if (prev && prev.startsWith("/uploads/branding/")) {
      const rel = prev.replace(/^\/uploads\//, "");
      const abs = path.join(UPLOAD_ROOT, rel);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    await prisma.systemSetting.deleteMany({ where: { key: "company.logo" } });
    return { ok: true };
  });

  app.get("/api/asset-field-definitions", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const includeInactive = q.includeInactive === "true" || q.includeInactive === "1";
    return listAssetFieldDefinitions(includeInactive);
  });

  app.post("/api/asset-field-definitions", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const b = z
      .object({
        key: z.string().min(1),
        label: z.string().min(1),
        fieldType: z.enum(["STRING", "NUMBER", "BOOLEAN", "DATE", "SELECT"]),
        optionsJson: z.string().optional().nullable(),
        required: z.boolean().optional(),
        sortOrder: z.number().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      return await createAssetFieldDefinition(b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/api/asset-field-definitions/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        label: z.string().optional(),
        fieldType: z.enum(["STRING", "NUMBER", "BOOLEAN", "DATE", "SELECT"]).optional(),
        optionsJson: z.string().optional().nullable(),
        required: z.boolean().optional(),
        sortOrder: z.number().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      return await updateAssetFieldDefinition(id, b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.delete("/api/asset-field-definitions/:id", async (req, reply) => {
    if (!assertAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      await deleteAssetFieldDefinition(id, req.authUser?.username);
      return reply.code(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/sync/overview", async () => getSyncOverview());

  app.get("/api/transfers", async () => listTransferOrders());

  app.post("/api/transfers", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        assetId: z.string(),
        fromOrgUnitId: z.string().optional().nullable(),
        toOrgUnitId: z.string().optional().nullable(),
        fromLocationId: z.string().optional().nullable(),
        toLocationId: z.string().optional().nullable(),
        remark: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      const row = await createTransferOrder({
        ...b,
        applicantUserId: req.authUser?.id ?? null,
        actor: req.authUser?.username,
      });
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/transfers/:id/submit", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await submitTransferOrder(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/transfers/:id/approve", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await approveTransferOrder(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/transfers/:id/reject", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z.object({ reason: z.string().min(1) }).parse(req.body);
    try {
      return await rejectTransferOrder(id, b.reason, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/disposals", async () => listDisposalOrders());

  app.post("/api/disposals", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        assetId: z.string(),
        disposalType: z.enum(["SCRAP", "SALE", "DONATE"]),
        reason: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      const row = await createDisposalOrder({
        ...b,
        applicantUserId: req.authUser?.id ?? null,
        actor: req.authUser?.username,
      });
      return reply.code(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/disposals/:id/submit", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await submitDisposalOrder(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/disposals/:id/approve", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await approveDisposalOrder(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/disposals/:id/reject", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z.object({ reason: z.string().min(1) }).parse(req.body);
    try {
      return await rejectDisposalOrder(id, b.reason, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/inventory/tasks", async () => listInventoryTasks());

  app.get("/api/inventory/tasks/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const t = await getInventoryTask(id);
    if (!t) return reply.status(404).send({ error: "任务不存在" });
    return t;
  });

  app.post("/api/inventory/tasks", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        name: z.string().min(1),
        plannedDate: z.string().datetime().optional().nullable(),
        scopeOrgUnitId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(req.body);
    const row = await createInventoryTask({
      name: b.name,
      plannedDate: b.plannedDate ? new Date(b.plannedDate) : null,
      scopeOrgUnitId: b.scopeOrgUnitId,
      notes: b.notes,
      actor: req.authUser?.username,
    });
    return reply.code(201).send(row);
  });

  app.post("/api/inventory/tasks/:id/start", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await startInventoryTask(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/inventory/tasks/:id/lines", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z.object({ assetIds: z.array(z.string()).min(1) }).parse(req.body);
    try {
      return await addInventoryLines(id, b.assetIds, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/inventory/tasks/:id/lines-by-asset-no", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z.object({ assetNo: z.string().min(1) }).parse(req.body);
    try {
      return await addInventoryLinesByAssetNo(id, b.assetNo.trim(), req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/inventory/lines/:lineId/count", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const lineId = (req.params as { lineId: string }).lineId;
    const b = z
      .object({
        actualQty: z.number().int(),
        varianceReason: z.string().optional().nullable(),
      })
      .parse(req.body);
    try {
      return await recordInventoryCount(lineId, b, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/inventory/tasks/:id/complete", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await completeInventoryTask(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/inventory/tasks/:id/cancel", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    try {
      return await cancelInventoryTask(id, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/procurement/requests", async () => listProcurementRequests());

  app.post("/api/procurement/requests", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        title: z.string().min(1),
        expectedAmount: z.string().optional().nullable(),
        remark: z.string().optional().nullable(),
        relatedAssetId: z.string().optional().nullable(),
      })
      .parse(req.body);
    const row = await createProcurementRequest({
      ...b,
      actor: req.authUser?.username,
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/procurement/requests/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z.object({ status: z.string().min(1) }).parse(req.body);
    return updateProcurementStatus(id, b.status, req.authUser?.username);
  });

  app.get("/api/finance/depreciation-runs", async () => listDepreciationRuns());

  app.post("/api/finance/depreciation-runs", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);
    try {
      return await runDepreciationForPeriod(b.period, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "计提失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/api/finance/depreciation-runs/:period/post", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const period = decodeURIComponent((req.params as { period: string }).period);
    try {
      return await postDepreciationRun(period, req.authUser?.username);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "入账失败";
      return reply.status(400).send({ error: msg });
    }
  });

  app.get("/api/finance/cards", async () => financeCardSummary());

  app.get("/api/software-licenses", async () => listSoftwareLicenses());

  app.post("/api/software-licenses", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        name: z.string().min(1),
        vendor: z.string().optional().nullable(),
        totalSeats: z.number().optional(),
        usedSeats: z.number().optional(),
        expireAt: z.string().datetime().optional().nullable(),
        assetId: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    const row = await createSoftwareLicense({
      ...b,
      expireAt: b.expireAt ? new Date(b.expireAt) : null,
      actor: req.authUser?.username,
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/software-licenses/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const b = z
      .object({
        name: z.string().optional(),
        vendor: z.string().optional().nullable(),
        totalSeats: z.number().optional(),
        usedSeats: z.number().optional(),
        expireAt: z.string().datetime().optional().nullable(),
        assetId: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    return updateSoftwareLicense(
      id,
      {
        ...b,
        expireAt:
          b.expireAt === undefined ? undefined : b.expireAt ? new Date(b.expireAt) : null,
      },
      req.authUser?.username,
    );
  });

  app.delete("/api/software-licenses/:id", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const id = (req.params as { id: string }).id;
    await deleteSoftwareLicense(id, req.authUser?.username);
    return reply.code(204).send();
  });

  app.get("/api/reports/summary-data", async () => assetSummaryReport());

  app.get("/api/reports/export-jobs", async () => listExportJobs());

  app.get("/api/mfg/molds", async () => listMolds());

  app.post("/api/mfg/molds", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        id: z.string().optional(),
        assetId: z.string(),
        moldCode: z.string().min(1),
        maxLife: z.number().optional(),
        usedCount: z.number().optional(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    return reply.code(201).send(await upsertMold({ ...b, actor: req.authUser?.username }));
  });

  app.get("/api/mfg/maintenance", async () => listMaintenance());

  app.post("/api/mfg/maintenance", async (req, reply) => {
    if (!assertNotViewer(req, reply)) return;
    const b = z
      .object({
        id: z.string().optional(),
        assetId: z.string(),
        nextDue: z.string().datetime().optional().nullable(),
        lastService: z.string().datetime().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    return reply.code(201).send(
      await upsertMaintenance({
        ...b,
        nextDue: b.nextDue ? new Date(b.nextDue) : b.nextDue === null ? null : undefined,
        lastService: b.lastService ? new Date(b.lastService) : b.lastService === null ? null : undefined,
        actor: req.authUser?.username,
      }),
    );
  });

  registerServerManagementRoutes(app);
}

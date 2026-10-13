# ERP 集成边界说明

## 财务真相源约定

- **推荐**：ERP 为固定资产**账面主数据**与**折旧凭证**真相源；本系统存 `ErpAssetRef`（`assetId` ↔ `erpAssetId`）及扩展字段（主机名、IP、分配关系）。
- **备选**：本系统为卡片与折旧运行源，通过队列向 ERP 推送凭证——需双方科目、期间、资产类别映射表（后续迭代）。

本仓库实现 **出站队列**（`ErpSyncQueue`）：未配置 `ERP_WEBHOOK_URL` 时处理任务仅标记 `DONE`；配置后对目标 URL 发起 `POST`（JSON 正文 + 可选 `X-Signature` HMAC-SHA256），失败则 `FAILED` 并写入 `lastError`。

## 接口边界

| 事件 | 队列 `entityType` | 载荷建议字段 |
|------|-------------------|--------------|
| 创建/更新资产卡片 | `ASSET_CARD` | `assetNo`, `category`, `originalValue`, `orgUnitId` |
| 转固 | `CAPITALIZATION` | PO/验收单号、资本化日期 |
| 折旧运行 | `DEPRECIATION_RUN` | 期间、汇总行 |
| 调拨 | `TRANSFER` | 自/至成本中心或法人 |
| 处置 | `DISPOSAL` | 处置类型、残值收入 |

## 同步方向

- `OUTBOUND_TO_ERP`：本系统 → ERP（默认）。
- `INBOUND_FROM_ERP`：ERP 回写卡片号/期间锁定等（worker 中解析）。

## 处理流程

1. 业务操作调用 `enqueueErpSync`（创建资产时已示例入队）。
2. 定时或手动调用 `POST /api/erp/queue/process`。
3. **环境变量**（见根目录 `.env.example`）：`ERP_WEBHOOK_URL`、`ERP_WEBHOOK_SECRET`（可选）、`ERP_TIMEOUT_MS`（默认 15000）。
4. 对接方应校验 `X-Signature`（与 body 原文 UTF-8 字节做 HMAC-SHA256，十六进制小写），并实现幂等与重试语义。

## 登记 ERP 资产号

`POST /api/erp/asset-ref`，body：`{ "assetId", "erpAssetId", "erpBook"?: "DEFAULT" }`，用于对账与联查。

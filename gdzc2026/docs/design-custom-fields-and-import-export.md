# 设计：Excel 导入导出、资产自定义字段、统一参数

## 1. 目标

- **Excel**：支持资产台账的 **导出（.xlsx）** 与 **批量导入（.xlsx）**，列包含系统固定字段 + 管理员配置的 **自定义字段**。
- **自定义字段**：通过表 `AssetFieldDefinition` 定义键、标签、类型（文本/数字/日期/布尔/下拉）；资产实体上 `customFieldsJson` 存键值；创建/编辑/导入时按定义校验。
- **参数集中**：企业微信、同步、审批、ERP 等键统一落在 `SystemSetting`（见 `docs/settings-keys.md`），管理端分组展示；运行时 **数据库优先于环境变量**（便于无重启调参，生产仍可用 env 作默认）。

## 2. 数据模型

### 2.1 AssetFieldDefinition

| 字段 | 说明 |
|------|------|
| key | 唯一，英文蛇形，如 `insurance_no` |
| label | 界面显示名 |
| fieldType | STRING \| NUMBER \| DATE \| BOOLEAN \| SELECT |
| optionsJson | SELECT 时存 JSON 数组字符串，如 `["在保","过保"]` |
| required | 是否必填（创建资产时） |
| sortOrder | 排序 |
| active | 是否启用 |

### 2.2 Asset.customFieldsJson

Prisma `Json` 类型，示例：`{ "insurance_no": "P-001", "warranty_end": "2026-12-31" }`。

## 3. Excel 约定

- **导出**：首行为表头；固定列（资产编号、名称、类别编码、位置编码、部门ID、状态、品牌、型号、序列号、备注、原值…）+ 每个启用自定义字段一列（表头为 `label`，或 `自定义:label` 避免与固定列重名）。
- **导入**：
  - 支持 **新增**：无 `assetNo` 或 `assetNo` 不存在时创建（资产编号可留空由系统生成）。
  - 支持 **更新**：`assetNo` 已存在则更新允许修改的列与自定义字段。
  - 类别/位置通过 **code** 解析；部门通过 **orgUnitId**（企微部门 id 字符串）。

## 4. API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/asset-field-definitions | 列表（登录） |
| POST | /api/asset-field-definitions | 新增（管理员） |
| PATCH | /api/asset-field-definitions/:id | 更新（管理员） |
| DELETE | /api/asset-field-definitions/:id | 删除（管理员） |
| GET | /api/assets/export.xlsx | 下载资产 Excel（非 viewer） |
| GET | /api/assets/import-template.xlsx | 下载空模板（非 viewer） |
| POST | /api/assets/import | multipart 上传 xlsx（非 viewer，字段名 `file`） |
| PUT | /api/system/settings/batch | 批量写入 `{ entries: { key, value, note? }[] }`（管理员） |

企微拉取逻辑：读取 `SystemSetting` 中 `wework.corp_id`、`wework.corp_secret`、`wework.root_dept_id`，为空则回退环境变量 `WEWORK_*`。

## 5. 前端

- **参数设置**页：分区展示（通用、企微、同步与任务、审批、ERP 提示、其他键值）；企微三项可编辑保存至 `SystemSetting`。
- **资产自定义字段**（管理员）：`/app/system/asset-fields`。
- **资产台账**：导出 Excel、下载模板、选择文件导入。
- **新建 / 编辑资产**：按启用中的字段定义渲染表单，提交 `customFieldsJson`（共用 `AssetCustomFieldsEditor` 组件）。

## 6. 安全

- 导入导出需 **非 viewer**；字段定义 CRUD 仅 **admin**。
- 导入行数与文件大小限制（如 5MB、5000 行）在服务端校验。

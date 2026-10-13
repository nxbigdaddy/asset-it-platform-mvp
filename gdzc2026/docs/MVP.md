# 一期 MVP 功能清单与验收标准

## 范围

一期对应系统设计中的「企业微信组织/人员同步 + 资产主数据 + 分配表 + 基础报表能力（以 API + 审计日志为基座）」，财务折旧与 ERP 凭证对接以**队列占位 + 映射表**形式呈现，完整凭证回传放在后续迭代。

## 功能清单

1. **主数据**
   - 资产分类树、位置树、成本中心、账簿（模型已建，种子数据含示例）。
   - 资产卡片：唯一 `assetNo`、类别、位置、状态枚举、组织归属（企业微信部门 ID）。
2. **企业微信镜像**
   - 部门、成员本地表；成员与部门多对多。
   - 提供 HTTP 接口推送同步数据（真实定时任务由部署环境用 cron / 系统任务调用接口或后续 worker）。
3. **分配**
   - `AssetAssignment`：一名员工多台设备；支持用途、ACTIVE 状态。
4. **命名**
   - `NamingPolicy` + `NamingSequence`：按策略与作用域递增序号；创建资产时可生成 `hostnameGenerated`。
5. **IPAM（最小）**
   - 网段、单 IP 记录、与资产多绑定（角色字段）；简易 /24 下一可用 IP 建议。
6. **ERP 边界**
   - `ErpSyncQueue` 出站队列；`ErpAssetRef` 本系统资产与 ERP 资产号映射；处理接口占位成功。
7. **审计**
   - 关键操作写入 `AuditLog`（创建资产、微信同步、队列入队等）。

## 验收标准

| 编号 | 场景 | 预期 |
|------|------|------|
| A1 | `GET /health` | 返回 `{ ok: true }` |
| A2 | `GET /api/categories` | 返回种子分类含 IT-NB、IT-SRV 等 |
| A3 | `POST /api/wx/sync/departments` 提交示例部门 | 部门写入并可 `GET /api/wx/departments` 查到 |
| A4 | `POST /api/wx/sync/users` 提交含 `department: [部门id]` 的用户 | 用户与部门关联正确 |
| A5 | `POST /api/assets` 带 `generateHostname: true`, `namingPolicyId: "seed-policy-nb"`, `categoryId`（IT-NB 的 id）, `orgUnitId: "wx-dept-fin"` | 返回资产带 `hostnameGenerated`，格式符合策略模板 |
| A6 | 同一请求带 `subnetId`（种子网段 id）、`autoIp: true` | 资产绑定一条 IP，`IpAddress.status` 为 ALLOCATED |
| A7 | `POST /api/assets` 带 `assignUserid: "zhangsan"` | `assignments` 含 ACTIVE 记录 |
| A8 | `GET /api/wx/departed-assignments` | 无离职用户时返回 `[]`；将用户 `active` 置 false 后应列出未归还分配（需数据库操作或后续接口） |
| A9 | `POST /api/erp/queue/process` | 队列项从 PENDING 变为 DONE（占位实现） |

## 非一期内容（后续）

- 完整折旧引擎与 ERP 凭证回传、审批流 UI、企业微信回调自动同步、DHCP/AD 联动、生产级 CIDR 计算库。

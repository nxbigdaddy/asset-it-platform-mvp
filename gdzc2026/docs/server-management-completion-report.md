# 服务器管理模块 — 完成情况检查报告

> 生成依据：代码库静态检查（`prisma/schema.prisma`、`src/services/serverManagement/*`、`src/routes/serverManagementRoutes.ts`、`web/src/pages/servers/*`）及 [server-management.md](server-management.md)。  
> 用途：对照「数据库服务器（DATABASE）角色」规划与其它迭代目标，记录**已完成**与**未实现/部分实现**项。

---

## 1. 规划项：DATABASE 角色（对照附件计划）

| 规划要求 | 状态 | 说明 |
|----------|------|------|
| `ServerRoleKind` 增加 `DATABASE` | **已完成** | 见 `prisma/schema.prisma` |
| `databaseProbeConnection` + `RoleProbeResult` | **已完成** | `src/services/serverManagement/roleProbeService.ts` |
| `databasePorts.ts` / 端口解析（engine、port、tcpPorts、默认 3306/5432/1433） | **已完成** | `src/services/serverManagement/databasePorts.ts` |
| `POST/GET …/database/probe` 与 `…/database/scan` | **已完成** | `serverManagementRoutes.ts` |
| `probeManagedServer` 聚合 DATABASE 端口 | **已完成** | `managedServerService.ts` |
| 前端 Tab「数据库」、`AddRoleForm` 含 DATABASE、列表描述 | **已完成** | `ServerDetailPage.tsx`、`ServerListPage.tsx` |
| 文档与 README 补充 | **已完成** | `docs/server-management.md`、`README.md` |
| 首版**不**引入 mysql2/pg 等驱动做 SQL 认证 | **符合** | 当前仅为 TCP 探活 |
| `prisma db push` / `generate` | **库结构**已对齐；**注意**：部分 Windows 环境 `prisma generate` 可能出现 EPERM（引擎 DLL 被占用），需在无占用进程时重试 |

**结论（DATABASE）**：规划中的首版交付项**均已落地**；与计划「后续扩展」一致的内容（如 `POST …/database/test-connection`）** intentionally 未实现**。

---

## 2. 服务器管理模块 — 其它角色与横切能力

### 2.1 已完成（摘要）

| 能力 | 说明 |
|------|------|
| 纳管服务器 CRUD、机器凭据（可选 AES 加密 `SERVER_CREDENTIAL_KEY`） | `managedServerService`、`serverCredentialCrypto` |
| 角色绑定 | AD / PRINT / FILE_SHARE / WEB / DATABASE；`isPrimary`、`allowWrite`、`allowAutomation`、`configJson` |
| 整机探活 | `POST /api/servers/:id/probe`；合并 AD LDAP 端口与 DATABASE 解析端口等 |
| AD | LDAP 测试、OU/用户/组只读；多种 LDAP 写入（含组成员增删）；`server.management.ldap_timeout_ms`；双开关 + 审计 |
| 打印 / 文件共享 / Web | 可配置 `configJson` + TCP/HTTP(S) 探活；`probe`/`scan` |
| 数据库 | TCP 多端口探活（非 SQL 登录验证） |
| 全局策略 | `server.management.global_write_enabled`、`server.management.global_automation_enabled`；`assertServerAutomationAllowed` 已实现（供后续定时/Agent 调用） |
| 前端 | 列表、新建（admin）、详情多 Tab、概览中角色开关、删除服务器、AD 写面板等 |

### 2.2 未实现或仅为占位（与历史迭代说明一致）

| 项 | 说明 |
|----|------|
| 打印 | 打印机清单、驱动/队列、**印量统计** | 需 WMI/WinRM/Agent，当前无 |
| 文件共享 | 共享枚举、ACL 读写、配置快照回滚 | 需 SMB 协议或远程 PowerShell |
| Web | IIS/Nginx 站点与进程级管理 | 需 WinRM、SSH 或 Agent |
| 数据库 | **凭据试连**（真实 SQL/TDS 握手） | 计划预留；需 mysql2/pg/tedious 等及策略 |
| `allowAutomation` | 业务自动化任务 | 字段与断言已有，**无**内置定时任务消费 |
| `KEY` 凭据驱动 SSH | Web/Linux 远程 | 未接闭环 |

### 2.3 风险与运维（文档已述，此处汇总）

- 凭据：演示库可能明文；生产建议 `SERVER_CREDENTIAL_KEY` 或 KMS。  
- 网络：探活与 LDAP 需防火墙放行。  
- AD 写、删除对象等属高危操作，依赖双开关与审计。

---

## 3. 建议的后续优先级（非本次交付）

1. 数据库：`POST …/database/test-connection`（受策略约束 + 审计脱敏）。  
2. 打印/文件：选型 WinRM 或 Agent 后分阶段接入只读清单。  
3. 自动化：在确需时接入调度器，调用 `assertServerAutomationAllowed` 后再执行作业。

---

## 4. 文档索引

- 模块说明与 API：[server-management.md](server-management.md)  
- 系统参数键：[settings-keys.md](settings-keys.md)  
- 全系统功能总览：[system-features-specification.md](system-features-specification.md)

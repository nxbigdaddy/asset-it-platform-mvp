# 服务器管理模块

在固定资产平台中统一登记 **纳管服务器**（`ManagedServer`），按角色绑定 **AD / 打印 / 文件共享 / Web / 数据库**，配置**机器账号凭据**（与用户 JWT 无关），并通过**全局参数 + 实例级 `allowWrite`** 控制远程写操作；所有变更写入**审计日志**（密码不落日志）。

## 数据模型（Prisma）

- **ManagedServer**：显示名、主机（IP/FQDN）、OS 类型、是否启用、最近探活时间与结果等。
- **ServerCredential**：每服务器至多一套（`serverId` 唯一）；`PASSWORD` / `KEY`；密文存储（演示环境若未接 KMS，请在部署文档中说明风险）。
- **ServerRoleBinding**：`serverId` + `role`（`AD` | `PRINT` | `FILE_SHARE` | `WEB` | `DATABASE`）唯一；`configJson`（LDAP BaseDN、`ldapUrl`、数据库引擎与端口等）、`isPrimary`、`allowWrite`、`allowAutomation`。

一台机器可有多条角色绑定（例如同时文件共享与打印）。

## 权限（与后端一致）

- **列表、详情、探活、AD 只读查询**：`admin` / `operator`（非 `viewer`）。
- **创建/更新/删除服务器、维护凭据与角色绑定、AD 写路径**：`admin`。

前端「新建服务器」路由仅 `admin` 可访问；列表页「新建」按钮亦仅管理员可见。

## 安全开关

1. **全局**：[`server.management.global_write_enabled`](settings-keys.md)（`SystemSetting`），默认建议 `false`。种子数据会写入 `false`。
2. **实例**：`ServerRoleBinding.allowWrite`。

写类适配器调用前须**同时**满足全局与实例开关，否则拒绝并记录原因。

3. **自动化（全局 + 实例）**：[`server.management.global_automation_enabled`](settings-keys.md) 与 `ServerRoleBinding.allowAutomation`。代码中已提供 `assertServerAutomationAllowed`，供后续定时任务、Agent 等调用前校验。

## 凭据加密（可选）

若设置环境变量 **`SERVER_CREDENTIAL_KEY`**（64 位十六进制，即 32 字节 AES-256 密钥），新写入的 `ServerCredential.secretEnc` 将以 **AES-256-GCM** 加密（前缀 `enc1:`）。未配置时仍为明文兼容旧数据。解密失败时请检查密钥是否与写入时一致。

## 审计

`entityType` 如 `ManagedServer`；创建/更新/删除服务器、角色绑定、探活、LDAP 测试等会写审计；**勿在摘要中包含密码或密钥明文**。

## API 摘要

前缀：`/api/servers`（需登录）。常用路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/api/servers` | 列表 / 创建 |
| GET / PATCH / DELETE | `/api/servers/:id` | 详情 / 更新 / 删除 |
| POST | `/api/servers/:id/probe` | TCP 探活（按角色默认端口等） |
| POST / PATCH / DELETE | `/api/servers/:id/roles`、…`/roles/:roleId` | 角色绑定 |
| POST | `…/roles/:bindingId/ad/test` | LDAP 连接测试 |
| GET | `…/roles/:bindingId/ad/ous` | OU 列表（只读） |
| GET | `…/roles/:bindingId/ad/users` | 用户搜索（只读） |
| GET | `…/roles/:bindingId/ad/groups` | 安全组搜索（只读） |
| POST | `…/roles/:bindingId/ad/write` | LDAP 写入（`action`: `createOu` / `deleteEntry` / `createUser` / `modifyUser` / `setPassword` / `addMemberToGroup` / `removeMemberFromGroup`；需全局 + `allowWrite`；审计脱敏密码） |
| POST / GET | `…/roles/:bindingId/print/probe` 与 `…/print/scan` | 打印探活（默认 TCP 445、9100；`configJson.tcpPorts` 可覆盖） |
| POST / GET | `…/file-share/probe` 与 `…/file-share/scan` | 文件共享探活（默认 445、139） |
| POST / GET | `…/web/probe` 与 `…/web/scan` | Web：多端口 TCP + HTTP(S) **HEAD**（见下） |
| POST / GET | `…/database/probe` 与 `…/database/scan` | 数据库：仅 **TCP 端口**探活（见下；非 SQL 认证） |

路径中 `…` 表示前缀 `/api/servers/:serverId`。

### DATABASE 的 `configJson`（探活）

首版**不**做驱动级 SQL 登录验证，仅 TCP 连通性。解析逻辑见 `src/services/serverManagement/databasePorts.ts`：

- **`tcpPorts`**：显式端口列表（最高优先级）。
- **`port`**：单端口（覆盖引擎默认）。
- **`engine`**（可选）：`mysql` / `mariadb` → 3306；`postgresql` / `postgres` → 5432；`sqlserver` / `mssql` → 1433；`mongodb` → 27017；`redis` → 6379；`oracle` → 1521。
- 均未配置时默认探测 **3306、5432、1433**。

后续可扩展 `POST …/database/test-connection`（mysql2/pg 等）做真实试连，需在文档与审计中脱敏。

### 打印 / 文件 / Web 的 `configJson`（探活）

- **通用**：`tcpPorts`（数组，覆盖默认端口）。
- **Web 额外**：`httpPort`（默认 80）、`httpsPort`（默认 443）、`probePath`（默认 `/`）、`tlsInsecure`（自签名证书时可为 `true`，仅影响 HTTPS HEAD）。

示例（Web）：

```json
{
  "tcpPorts": [80, 443, 8080, 8443],
  "httpPort": 80,
  "httpsPort": 443,
  "probePath": "/",
  "tlsInsecure": false
}
```

### AD 写入说明

- 所有目标 **DN** 必须在配置的 **baseDN** 后缀之下。
- **unicodePwd**（新建用户初始密码、`setPassword`）在 Active Directory 中通常要求 **LDAPS**（`ldaps://…:636`）。
- `createUser` 无密码时创建为 **禁用**（514）；若提供密码则在 LDAPS 上设密码并 **启用**（512）。

完整定义见 `src/routes/serverManagementRoutes.ts`。

## AD / LDAP 配置（`configJson` 示例）

```json
{
  "baseDN": "DC=corp,DC=local",
  "ldapUrl": "ldaps://dc.corp.local:636",
  "bindDN": "",
  "probePort": 389
}
```

- `ldapUrl` 可省略，默认按主机推导 `ldap://host:389`。
- 绑定账号可与 **ServerCredential** 中的用户名/密码配合使用。

## 静态与任务目录

上传根目录下预留 `uploads/server-jobs/`（与 `ensureUploadDirs` 一致），供后续导出任务或脚本日志使用。

## 风险与依赖

- **网络**：应用服务器到域控、文件服务器等需防火墙放行（如 389/636、445 等）。
- **凭据**：可配置环境变量 **SERVER_CREDENTIAL_KEY**（见上文「凭据加密」）；更高要求可用 KMS。SQLite 演示库需自行评估泄露风险。
- **LDAP**：操作超时由 **server.management.ldap_timeout_ms** 控制（默认 60000，见 settings-keys）。
- **打印 / WMI / WinRM**：当前阶段为占位或 TCP 探活；完整运维能力见后续迭代。
- **数据库**：当前仅为 **TCP 端口**可达性；**不等于** SQL 账号密码可用，试连能力见上文「后续可扩展」。

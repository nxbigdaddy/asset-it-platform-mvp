# 制造型企业固定资产与 IT 一体化平台（MVP）

基于 **Node.js + TypeScript + Fastify + Prisma** 实现计划中的核心数据模型与 API：资产主数据、企业微信组织/人员镜像、人员分配、可配置计算机命名、IPAM、ERP 同步队列；**Web 管理端**含登录、左侧树形菜单、符合国内习惯的排版与文案。

## 快速开始

```powershell
Set-Location <workspace>\gdzc2026
npm install
npm run db:push
npm run db:seed
npm run dev
```

开发时若希望**启动完成后自动打开登录页**，可使用：`npm run dev:open`（在检测到 `http://127.0.0.1:5173` 就绪后，用系统默认浏览器打开 `/login`）。请先结束已运行的 `npm run dev` 再执行，避免端口占用。

`npm run db:push` / `npm run db:generate` 会先根据 `.env` 中的 **`DATABASE_PROVIDER`** 写入 `prisma/schema.prisma` 的数据库类型（详见 [数据库配置](docs/database.md)）。测试阶段默认 **SQLite**。

### 登录

- 种子数据会创建管理员：**用户名 `admin`，密码 `admin123`**（生产环境请立即修改密码并更换 `JWT_SECRET`）。
- 除 `POST /api/auth/login` 外，其余 `/api/*` 接口需在请求头携带：`Authorization: Bearer <token>`（前端已自动处理）。

### Web 管理界面

- **菜单与路由**：侧边栏按角色过滤（`viewer` 仅浏览类入口；`admin`/`operator` 可进入写操作页；**用户与角色、参数设置、资产自定义字段** 仅 `admin`）。直链无权限路由会重定向到概览。
- **开发（推荐）**：`npm run dev` 会**先启动 API（3000），待端口就绪后再启动** Vite（5173），避免代理连不上后端。**请用浏览器打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)** 访问界面（不要只用 3000 看页面；3000 在开发时主要给接口与代理用）。
- **局域网访问**：Vite 已开启 `host: true`，可用本机局域网 IP 访问，例如 `http://192.168.x.x:5173`（请把防火墙放行对应端口）。
- **仅后端**：`npm run dev:api`，无界面。
- **生产一体部署**：先 `npm run build`（编译后端 + 构建 `web/dist`），再 `npm start`。此时 **打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)** 即可使用界面与 API 同端口。

#### 打不开页面时排查

| 现象 | 处理 |
|------|------|
| 只开了 3000，页面空白或提示未构建 | 开发时请访问 **5173**；或先执行 `npm run build` 再 `npm start` 用 3000 |
| 登录提示无法连接后端 | 确认 API 已监听 3000；开发请用 `npm run dev`（不要只开 Vite） |
| 用局域网 IP 打不开 5173 | 已开启 `host: true`，检查防火墙；或改用 `127.0.0.1` 本机访问 |
| **登录接口返回 `{"error":"Not found"}`（404）** | 多为 **3000 端口被其它进程占用**，当前启动的 Node **并未真正监听**，请求打到旧服务。请在任务管理器结束占用 3000 的旧 `node`，或临时改用 `set PORT=3001` 再启动，并同步改 Vite 代理目标（见下） |
| **接口返回 404 且 body 含 `path`/`hint`** | 请求路径或方法与后端不一致；请确认使用 **`npm run dev`（前端 5173）** 或 **`npm run build` 后 `npm start`（同端口 3000）**，勿让浏览器直接请求**未实现**的 `/api/...`。404 响应中会带 `method`、`path` 便于核对。 |

**Windows 查看谁占用 3000**：`netstat -ano | findstr :3000`，再用任务管理器结束对应 PID。

若后端改用其它端口（例如 3001），可在 `web/` 下新建 `.env`：`VITE_API_TARGET=http://127.0.0.1:3001`，再重启 `npm run dev`。

健康检查（无需登录）：`GET /health`。

## 环境变量

复制 [.env.example](.env.example) 为 `.env` 并按环境修改。

| 变量 | 说明 |
|------|------|
| `DATABASE_PROVIDER` | `sqlite`（默认）、`mysql`、`sqlserver` |
| `DATABASE_URL` | 对应 Prisma 连接串 |
| `JWT_SECRET` | JWT 签名密钥，**生产环境必须修改** |
| `SERVER_CREDENTIAL_KEY` | 可选：64 位十六进制（32 字节），用于加密存储「服务器管理」机器凭据；未设置则仍为明文入库 |
| `PORT`、`HOST` | 可选 |

## 文档

- [数据库配置（SQLite / MySQL / SQL Server）](docs/database.md)
- [一期 MVP 范围与验收](docs/MVP.md)
- [企业微信同步设计](docs/wechat-sync.md)
- [命名策略与 IPAM](docs/naming-ipam.md)
- [ERP 集成边界](docs/erp-integration.md)
- [Excel 导入导出、自定义字段、统一参数设计](docs/design-custom-fields-and-import-export.md)
- [SystemSetting 键说明（企微、审批、同步等）](docs/settings-keys.md)
- [服务器管理（纳管、LDAP、安全开关）](docs/server-management.md)
- [服务器管理完成情况检查报告](docs/server-management-completion-report.md)
- [系统功能说明（总览）](docs/system-features-specification.md)

## API 摘要

完整路由见 `src/routes/index.ts`。以下为常用入口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录，返回 JWT（含 `orgScopeJson`） |
| GET | /api/auth/me | 当前用户 |
| GET | /api/categories | 资产分类 |
| GET | /api/locations | 位置 |
| GET | /api/wx/departments | 微信部门镜像 |
| GET | /api/wx/users | 微信成员镜像 |
| POST | /api/wx/sync/departments | 推送同步部门 |
| POST | /api/wx/sync/users | 推送同步成员 |
| POST | /api/wx/sync/from-remote | 配置 `WEWORK_CORP_ID`/`SECRET` 时由服务端拉取企微全量 |
| GET | /api/wx/departed-assignments | 离职人员未归还分配 |
| GET | /api/assets | 资产列表（按登录用户组织范围过滤） |
| GET | /api/assets/lookup?assetNo= | 按编号查询（校验范围） |
| GET | /api/assets/:id | 资产详情 |
| PATCH | /api/assets/:id | 更新资产 |
| POST | /api/assets | 创建资产（可选主机名、IP、分配使用人、`customFieldsJson`） |
| GET | /api/assets/export.xlsx | 导出资产台账 Excel（非 viewer） |
| GET | /api/assets/import-template.xlsx | 下载导入模板（非 viewer） |
| POST | /api/assets/import | 上传 xlsx 批量导入（multipart `file`，非 viewer） |
| GET | /api/asset-field-definitions | 自定义字段定义列表 |
| POST/PATCH/DELETE | /api/asset-field-definitions… | 维护定义（写操作 admin） |
| PUT | /api/system/settings/batch | 批量保存系统参数（管理员） |
| POST | /api/naming/preview | 预览主机名 |
| GET | /api/naming-policies | 命名策略 |
| GET | /api/subnets | 网段 |
| POST | /api/subnets | 新建网段 |
| GET | /api/subnets/:id/suggest-ip | 建议下一空闲 IP（/24 简化） |
| POST | /api/ip/allocate | 分配 IP |
| GET | /api/system/approval-config | 调拨/处置审批总步数 |
| POST | /api/transfers | 调拨单；`/submit`、`/approve`、`/reject` |
| POST | /api/disposals | 处置单；同上 |
| POST | /api/inventory/tasks | 盘点任务；`/start`、`/complete`、`/lines`、`/lines-by-asset-no` |
| POST | /api/inventory/lines/:lineId/count | 录入实盘 |
| GET | /api/reports/summary-data | 汇总报表数据 |
| POST | /api/export-jobs | 导出任务 |
| GET | /api/users | 用户列表（管理员） |
| POST | /api/users | 创建用户（可选 `orgScopeJson`） |
| PATCH | /api/users/:id | 更新用户 |
| POST | /api/erp/queue/process | 处理 ERP 出站队列 |
| POST | /api/erp/asset-ref | 登记 ERP 资产号映射 |
| GET | /api/audit-logs | 审计日志 |
| GET | /api/sync/overview | 同步任务与近期审计 |
| GET/POST 等 | /api/servers | 纳管服务器 CRUD、探活、角色绑定（含 **DATABASE** TCP 探活）、AD/LDAP 只读与写策略；详见 [docs/server-management.md](docs/server-management.md) |

## 项目结构

- `prisma/schema.prisma`：领域模型
- `src/services/`：命名、IPAM、资产、微信同步、ERP 队列
- `src/routes/index.ts`：HTTP 路由
- `web/`：Vite + React 管理端（登录、侧栏、资产详情/编辑/附件、导出、软件许可、主数据等）
- `web/src/config/menu.ts`：侧边栏菜单树；`web/src/config/breadcrumbs.ts`：路径与面包屑文案
- `scripts/set-prisma-provider.mjs`：按 `DATABASE_PROVIDER` 切换 Prisma 数据源类型

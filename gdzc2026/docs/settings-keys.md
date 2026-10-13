# SystemSetting 键说明（统一参数）

所有键存于表 `SystemSetting`（`key` / `value` / `note`）。以下为约定键名；未列出的键仍可通过「其他参数」表格维护。

## 通用

| 键 | 说明 | 示例 |
|----|------|------|
| `company.name` | 公司名称（侧栏主标题、浏览器标题前缀） | 某某制造有限公司 |
| `app.title` | 系统产品名称（侧栏副标题、登录页主标题、浏览器标题） | 资产与终端一体化平台 |
| `company.logo` | Logo 访问路径（由上传接口写入，勿手填） | `/uploads/branding/company-logo.png` |

## 审批

| 键 | 说明 |
|----|------|
| `approval.transfer.steps` | 调拨审批步数 1–10 |
| `approval.disposal.steps` | 处置审批步数 1–10 |

## 企业微信（通讯录拉取）

| 键 | 说明 |
|----|------|
| `wework.corp_id` | 企业 ID（corpid） |
| `wework.corp_secret` | 应用 Secret（建议生产加密存储，当前为明文） |
| `wework.root_dept_id` | `user/list` 根部门 id，默认 `1` |

运行时：**数据库值优先**；若为空则读取环境变量 `WEWORK_CORP_ID`、`WEWORK_CORP_SECRET`、`WEWORK_ROOT_DEPT_ID`。

## 同步与调度

| 键 | 说明 |
|----|------|
| `sync.scheduler.minutes` | 进程内定时任务间隔（分钟），与 `SYNC_SCHEDULER_MINUTES` 二选一，DB 优先 |

## ERP（提示）

| 键 | 说明 |
|----|------|
| （环境变量为主） | `ERP_WEBHOOK_URL`、`ERP_WEBHOOK_SECRET` 仍以 `.env` 配置为宜 |

## 服务器管理

| 键 | 说明 | 示例 |
|----|------|------|
| `server.management.global_write_enabled` | **全局**是否允许通过适配器对 AD 等执行**写类**操作（与单实例角色上的 `allowWrite` 为**双重开关**，二者均为真才允许写）。默认建议 `false`。 | `false` / `true` |
| `server.management.global_automation_enabled` | **全局**是否允许**自动化**类能力（与角色 `allowAutomation` 组合；供后续定时任务/Agent 使用）。默认建议 `false`。 | `false` / `true` |
| `server.management.ldap_timeout_ms` | LDAP 客户端**操作超时**（毫秒），应用于连接、搜索等；建议 `5000`–`300000`，默认 `60000`。 | `60000` |

模块说明、端口与 API 见 [server-management.md](server-management.md)。

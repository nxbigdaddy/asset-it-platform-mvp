# 数据库配置（SQLite / MySQL / SQL Server）

Prisma 在**一次生成**中只支持**一种** `datasource provider`。本项目通过脚本 `scripts/set-prisma-provider.mjs` 在运行 `npm run db:generate`、`npm run db:push` 前，根据环境变量 **`DATABASE_PROVIDER`** 写入 `prisma/schema.prisma` 中的 `provider` 字段。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_PROVIDER` | `sqlite`（默认）、`mysql`（含 MariaDB）、`sqlserver`（或 `mssql`） |
| `DATABASE_URL` | 对应 Prisma 官方文档中的连接串 |
| `JWT_SECRET` | 登录令牌签名密钥，生产环境必须修改 |

复制 [`.env.example`](../.env.example) 为 `.env` 后按需修改。

## 连接串示例

- **SQLite（测试）**  
  `DATABASE_URL="file:./dev.db"`  
  数据库文件默认在 `prisma/dev.db`（相对 `schema.prisma` 所在目录）。

- **MySQL**  
  `DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"`

- **SQL Server**  
  `DATABASE_URL="sqlserver://USER:PASSWORD@HOST:1433;database=DB;encrypt=true;trustServerCertificate=true"`

具体参数以 [Prisma 文档](https://www.prisma.io/docs/orm/reference/connection-urls) 为准。

## 切换数据库步骤

1. 在 `.env` 中设置 `DATABASE_PROVIDER` 与 `DATABASE_URL`。  
2. 执行 `npm run db:push`（或 `npm run db:generate` + 迁移策略）。  
3. 执行 `npm run db:seed` 初始化管理员（如需要）。  

**注意**：不同数据库之间**不能**直接复用同一套物理文件；切换后需自行迁移数据。

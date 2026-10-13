# 企业微信部门与成员同步设计

## 数据映射

| 企业微信 | 本地表 | 说明 |
|----------|--------|------|
| `department.id` | `WxDepartment.id` | 字符串主键 |
| `department.name` | `WxDepartment.name` | |
| `department.parentid` | `WxDepartment.parentId` | 0 或缺省表示根 |
| `department.order` | `WxDepartment.order` | |
| `user.userid` | `WxUser.userid` | 唯一业务键 |
| `user.department[]` | `WxUserDepartment` | 多对多，顺序写入 `order` |

资产侧：`Asset.orgUnitId` → `WxDepartment.id`，实现科室/小组级归属。

## 同步接口与频率

- **入口**：`POST /api/wx/sync/departments`、`POST /api/wx/sync/users`  
  请求体为企业微信 API 返回结构的子集（见路由 Zod 校验）。
- **远程拉取**（可选）：配置环境变量 `WEWORK_CORP_ID`、`WEWORK_CORP_SECRET`（通讯录同步或具备通讯录权限的应用 Secret）后，可调用 `POST /api/wx/sync/from-remote` 由服务端直连 `qyapi.weixin.qq.com` 拉取全量部门与成员并写入镜像；`WEWORK_ROOT_DEPT_ID` 默认为 `1`，用于 `user/list` 的根部门。若未配置密钥，接口返回 400。
- **推荐频率**（部署时由调度器执行）：
  - 部门：每日 1～2 次全量或增量（变更少）。
  - 成员：每 15～30 分钟增量；业务高峰可缩短。
- **进程内定时**：`SYNC_SCHEDULER_MINUTES` > 0 时，若已配置上述企微变量，则按间隔执行远程拉取；否则仅写心跳与审计（见 `schedulerService.ts`）。

## 冲突与离职策略

1. **部门重名**：以 `id` 为准，名称更新覆盖。
2. **用户重复 `userid`**：`upsert` 更新资料与 `active`。
3. **部门列表变更**：先 `syncUsers` 全量替换该用户的 `WxUserDepartment` 行（当前实现），与官方「主部门」逻辑可后续扩展 `isLeader`。
4. **离职**：`status !== 1` 时 `WxUser.active = false`。回收流程：
   - 查询 `findAssignmentsForDepartedUsers()`（服务：`src/services/wxSyncService.ts`）列出仍 `ACTIVE` 的分配；
   - 业务上生成待办或调用工作流，归还后 `AssetAssignment.status = RETURNED`，必要时释放 IP（`ipamService.releaseIpBindingsForAsset` 已提供）。

## 与定时任务的关系

在生产环境使用 **cron**、**Windows 计划任务** 或 **K8s CronJob** 定时 `POST` 上述接口即可；若需内网-only，可改为同进程 `setInterval` 调用服务层函数并注入企业微信客户端。

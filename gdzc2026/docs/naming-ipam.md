# 命名策略与 IPAM 规则说明

## 命名策略（`NamingPolicy` + `NamingSequence`）

### 模板变量

| 占位符 | 含义 | 数据来源 |
|--------|------|----------|
| `{site}` | 站点/厂区码 | 策略字段 `siteCode`，缺省 `A` |
| `{dept}` | 部门缩写 | `WxDepartment.shortCode`，否则取部门 id 前 6 位 |
| `{type}` | 类型码 | `AssetCategory.typeCode`，否则 `category.code` |
| `{seq}` / `{seq:N}` | 序号 | 同一 `policyId + scopeKey` 下递增，`N` 为补零宽度 |

### 作用域 `scopeKey`

格式：`{policyId}|{orgUnitId 或 NONE}|{categoryId}`  

即：同一策略下，**不同部门或不同类别**序号独立递增（实现见 `src/services/namingService.ts`）。

### 唯一性

生成后检查 `Asset.hostnameGenerated` 是否已存在；若冲突则序号 +1 重试（最多 50 次）。

### 预览

`POST /api/naming/preview` 不传库内序号，仅按给定 `seq` 渲染模板，用于配置校验。

---

## IPAM（`Subnet` + `IpAddress` + `AssetIpBinding`）

### 网段 `Subnet`

- `cidr`：唯一；`vlanId`、`purpose`（办公/生产/服务器/管理/访客/其他）、网关、DNS。

### IP 记录 `IpAddress`

- 同一网段下 `address` 唯一。
- 状态：`PLANNED` | `ALLOCATED` | `FREE` | `RESERVED`（网关、广播等可标 RESERVED）。

### 资产绑定

- `AssetIpBinding`：`assetId` + `ipAddressId` + `role`（如 `mgmt`、`data`、`ilo`）+ 可选 `macAddress`。
- 同一资产同一 IP 不重复（表级唯一）。

### 分配流程

1. `allocateIp(subnetId, address)`：创建或更新 IP 为 `ALLOCATED`。
2. `bindIpToAsset`：建立绑定。
3. `suggestNextFreeIp`：当前为 **/24 简化实现**，在 `.10`～`.250` 间找未占用地址；生产环境建议替换为完整 CIDR 解析库。

### 与多类设备

PC、服务器、交换机、打印机等**统一**使用 `IpAddress` + `AssetIpBinding`，通过资产类别区分设备类型，不单独建「电脑 IP 表」。

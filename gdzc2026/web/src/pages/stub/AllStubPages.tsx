import { StubPage } from "./StubPage";

export function PageAssetCategories() {
  return (
    <StubPage
      title="资产分类"
      description="维护资产分类树，与台账、命名策略等联动。"
      tableColumns={["分类编码", "分类名称", "上级分类", "排序", "操作"]}
    />
  );
}

export function PageAssetLocations() {
  return (
    <StubPage
      title="位置管理"
      description="厂区、车间、产线/机房等位置树，用于资产定位与盘点。"
      tableColumns={["位置编码", "位置名称", "上级位置", "排序", "操作"]}
    />
  );
}

export function PageAssetTransfers() {
  return (
    <StubPage
      title="资产调拨"
      description="跨部门、跨地点调拨申请与审批流程（占位）。"
      tableColumns={["调拨单号", "资产编号", "调出", "调入", "状态", "操作"]}
    />
  );
}

export function PageAssetDisposals() {
  return (
    <StubPage
      title="资产处置"
      description="报废、变卖、捐赠等处置申请与下账联动（占位）。"
      tableColumns={["处置单号", "资产编号", "处置方式", "状态", "操作"]}
    />
  );
}

export function PageProcurementPending() {
  return (
    <StubPage
      title="验收待转固"
      description="已到货待验收、待资本化的资产清单。"
      tableColumns={["采购单号", "物料", "数量", "验收状态", "操作"]}
    />
  );
}

export function PageProcurementOrders() {
  return (
    <StubPage
      title="采购关联"
      description="采购订单与资产卡片、合同关联查询。"
      tableColumns={["订单号", "供应商", "金额", "关联资产", "操作"]}
    />
  );
}

export function PageInventoryTasks() {
  return (
    <StubPage
      title="盘点任务"
      description="周期盘点、抽盘任务下达与进度跟踪。"
      tableColumns={["任务编号", "盘点范围", "计划日期", "状态", "操作"]}
    />
  );
}

export function PageInventoryExecute() {
  return (
    <StubPage
      title="盘点执行"
      description="移动端/扫码盘点入口（占位）。"
      tableColumns={["任务编号", "资产编号", "账存", "实盘", "差异"]}
    />
  );
}

export function PageFinanceDepreciation() {
  return (
    <StubPage
      title="折旧汇总"
      description="按期间、部门、类别汇总折旧计提与凭证推送预览。"
      tableColumns={["期间", "资产数", "本期折旧", "累计折旧", "操作"]}
    />
  );
}

export function PageFinanceCards() {
  return (
    <StubPage
      title="财务卡片视图"
      description="与总账口径一致的资产价值、折旧明细视图。"
      tableColumns={["资产编号", "原值", "残值", "月折旧", "账面净值"]}
    />
  );
}

export function PageMfgEquipment() {
  return (
    <StubPage
      title="设备与维保"
      description="设备台账扩展、维保计划与工单（占位，可对接 EAM）。"
      tableColumns={["设备位号", "资产编号", "下次保养", "状态", "操作"]}
    />
  );
}

export function PageMfgMolds() {
  return (
    <StubPage
      title="模具工装"
      description="模具寿命、与批次/产品关联（占位）。"
      tableColumns={["模具编号", "资产编号", "已用次数", "寿命上限", "操作"]}
    />
  );
}

export function PageOrgSync() {
  return (
    <StubPage
      title="同步日志"
      description="企业微信通讯录同步任务记录与异常明细。"
      tableColumns={["时间", "类型", "成功数", "失败数", "详情"]}
    />
  );
}

export function PageNetworkIpRecords() {
  return (
    <StubPage
      title="IP 分配记录"
      description="按时间、网段查看 IP 分配与释放历史。"
      tableColumns={["时间", "IP", "资产", "操作人", "备注"]}
    />
  );
}

export function PageNamingPolicies() {
  return (
    <StubPage
      title="计算机命名策略"
      description="配置模板变量、序号作用域；与新建资产时生成主机名联动。"
      tableColumns={["策略名称", "模板", "作用域", "默认", "操作"]}
    />
  );
}

export function PageReportsSummary() {
  return (
    <StubPage
      title="汇总报表"
      description="按部门、类别、状态的资产统计与图表（占位）。"
      tableColumns={["统计维度", "数量", "原值合计", "净值合计"]}
    />
  );
}

export function PageReportsExport() {
  return (
    <StubPage
      title="导出中心"
      description="导出任务队列与下载链接（占位）。"
      tableColumns={["任务 ID", "类型", "创建时间", "状态", "下载"]}
    />
  );
}

export function PageSystemUsers() {
  return (
    <StubPage
      title="用户与角色"
      description="后台账号、角色、菜单权限与数据权限（占位）。"
      tableColumns={["用户名", "姓名", "角色", "状态", "操作"]}
    />
  );
}

export function PageSystemSettings() {
  return (
    <StubPage
      title="参数设置"
      description="系统参数、编码规则、审批开关等（占位）。"
      tableColumns={["参数键", "说明", "当前值", "操作"]}
    />
  );
}

export function PageSystemErp() {
  return (
    <StubPage
      title="ERP 对接"
      description="资产同步队列、凭证回传、映射关系维护（占位）。"
      tableColumns={["队列 ID", "类型", "状态", "最近错误", "操作"]}
    />
  );
}

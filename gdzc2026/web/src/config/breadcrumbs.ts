/** 根据 pathname 解析面包屑（与菜单、路由保持一致） */

type Rule = { match: RegExp; crumbs: string[] };

const RULES: Rule[] = [
  { match: /^\/app\/dashboard$/, crumbs: ["工作台", "概览"] },

  { match: /^\/app\/assets\/new$/, crumbs: ["资产管理", "新建资产"] },
  {
    match: /^\/app\/assets\/[^/]+\/edit$/,
    crumbs: ["资产管理", "编辑资产"],
  },
  { match: /^\/app\/assets\/categories$/, crumbs: ["资产管理", "资产分类"] },
  { match: /^\/app\/assets\/locations$/, crumbs: ["资产管理", "位置管理"] },
  { match: /^\/app\/assets\/transfers$/, crumbs: ["资产管理", "资产调拨"] },
  { match: /^\/app\/assets\/disposals$/, crumbs: ["资产管理", "资产处置"] },
  {
    match:
      /^\/app\/assets\/(?!new$|categories$|locations$|transfers$|disposals$)[^/]+$/,
    crumbs: ["资产管理", "资产详情"],
  },
  { match: /^\/app\/assets$/, crumbs: ["资产管理", "资产台账"] },

  { match: /^\/app\/procurement\/pending$/, crumbs: ["采购与转固", "验收待转固"] },
  { match: /^\/app\/procurement\/orders$/, crumbs: ["采购与转固", "采购关联"] },

  { match: /^\/app\/inventory\/tasks$/, crumbs: ["盘点管理", "盘点任务"] },
  { match: /^\/app\/inventory\/execute$/, crumbs: ["盘点管理", "盘点执行"] },

  { match: /^\/app\/finance\/depreciation$/, crumbs: ["折旧与财务", "折旧汇总"] },
  { match: /^\/app\/finance\/cards$/, crumbs: ["折旧与财务", "财务卡片视图"] },

  { match: /^\/app\/mfg\/equipment$/, crumbs: ["制造扩展", "设备与维保"] },
  { match: /^\/app\/mfg\/molds$/, crumbs: ["制造扩展", "模具工装"] },

  { match: /^\/app\/org\/sync$/, crumbs: ["企业微信", "同步日志"] },
  { match: /^\/app\/org$/, crumbs: ["企业微信", "组织与人员"] },

  { match: /^\/app\/servers\/new$/, crumbs: ["服务器管理", "新建服务器"] },
  {
    match: /^\/app\/servers\/(?!new$)[^/]+$/,
    crumbs: ["服务器管理", "服务器详情"],
  },
  { match: /^\/app\/servers$/, crumbs: ["服务器管理", "服务器列表"] },

  { match: /^\/app\/network\/ip-records$/, crumbs: ["网络管理", "IP 分配记录"] },
  { match: /^\/app\/network$/, crumbs: ["网络管理", "网段与 IP"] },

  { match: /^\/app\/naming\/policies$/, crumbs: ["命名策略", "计算机命名策略"] },
  { match: /^\/app\/software\/licenses$/, crumbs: ["命名策略", "软件许可"] },

  { match: /^\/app\/reports\/summary$/, crumbs: ["报表中心", "汇总报表"] },
  { match: /^\/app\/reports\/export$/, crumbs: ["报表中心", "导出中心"] },

  { match: /^\/app\/system\/users$/, crumbs: ["系统管理", "用户与角色"] },
  { match: /^\/app\/system\/settings$/, crumbs: ["系统管理", "参数设置"] },
  { match: /^\/app\/system\/asset-fields$/, crumbs: ["系统管理", "资产自定义字段"] },
  { match: /^\/app\/system\/erp$/, crumbs: ["系统管理", "ERP 对接"] },

  { match: /^\/app\/audit$/, crumbs: ["系统管理", "审计日志"] },
];

export function getBreadcrumbs(pathname: string): string[] {
  for (const r of RULES) {
    if (r.match.test(pathname)) return r.crumbs;
  }
  return [];
}

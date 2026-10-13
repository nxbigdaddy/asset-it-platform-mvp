/** 侧边栏菜单树（与路由 path 后缀一致，便于维护） */

export type AppRole = "admin" | "operator" | "viewer";

/** 可写操作：管理员与运维；只读账号不展示对应菜单 */
export const ROLES_STAFF: readonly AppRole[] = ["admin", "operator"];
/** 仅管理员（与后端 assertAdmin 一致） */
export const ROLES_ADMIN_ONLY: readonly AppRole[] = ["admin"];

const W = ROLES_STAFF;
const A = ROLES_ADMIN_ONLY;

export type MenuItem = { to: string; label: string; roles?: readonly AppRole[] };
export type MenuGroup = { id: string; title: string; children: MenuItem[] };

export const APP_MENU: MenuGroup[] = [
  { id: "work", title: "工作台", children: [{ to: "/app/dashboard", label: "概览" }] },
  {
    id: "asset",
    title: "资产管理",
    children: [
      { to: "/app/assets", label: "资产台账" },
      { to: "/app/assets/new", label: "新建资产", roles: W },
      { to: "/app/assets/categories", label: "资产分类" },
      { to: "/app/assets/locations", label: "位置管理" },
      { to: "/app/assets/transfers", label: "资产调拨", roles: W },
      { to: "/app/assets/disposals", label: "资产处置", roles: W },
    ],
  },
  {
    id: "proc",
    title: "采购与转固",
    children: [
      { to: "/app/procurement/pending", label: "验收待转固", roles: W },
      { to: "/app/procurement/orders", label: "采购关联", roles: W },
    ],
  },
  {
    id: "inv",
    title: "盘点管理",
    children: [
      { to: "/app/inventory/tasks", label: "盘点任务" },
      { to: "/app/inventory/execute", label: "盘点执行", roles: W },
    ],
  },
  {
    id: "fin",
    title: "折旧与财务",
    children: [
      { to: "/app/finance/depreciation", label: "折旧汇总" },
      { to: "/app/finance/cards", label: "财务卡片视图" },
    ],
  },
  {
    id: "mfg",
    title: "制造扩展",
    children: [
      { to: "/app/mfg/equipment", label: "设备与维保" },
      { to: "/app/mfg/molds", label: "模具工装" },
    ],
  },
  {
    id: "wx",
    title: "企业微信",
    children: [
      { to: "/app/org", label: "组织与人员" },
      { to: "/app/org/sync", label: "同步日志" },
    ],
  },
  {
    id: "srv",
    title: "服务器管理",
    children: [{ to: "/app/servers", label: "服务器列表" }],
  },
  {
    id: "net",
    title: "网络管理",
    children: [
      { to: "/app/network", label: "网段与 IP" },
      { to: "/app/network/ip-records", label: "IP 分配记录" },
    ],
  },
  {
    id: "nam",
    title: "命名策略",
    children: [
      { to: "/app/naming/policies", label: "计算机命名策略" },
      { to: "/app/software/licenses", label: "软件许可" },
    ],
  },
  {
    id: "rpt",
    title: "报表中心",
    children: [
      { to: "/app/reports/summary", label: "汇总报表" },
      { to: "/app/reports/export", label: "导出中心", roles: W },
    ],
  },
  {
    id: "sys",
    title: "系统管理",
    children: [
      { to: "/app/system/users", label: "用户与角色", roles: A },
      { to: "/app/system/settings", label: "参数设置", roles: A },
      { to: "/app/system/asset-fields", label: "资产自定义字段", roles: A },
      { to: "/app/system/erp", label: "ERP 对接" },
      { to: "/app/audit", label: "审计日志" },
    ],
  },
];

/** 按当前用户角色过滤菜单；空组会被去掉 */
export function menuForRole(role: string | undefined): MenuGroup[] {
  const r: AppRole =
    role === "admin" || role === "operator" || role === "viewer" ? role : "viewer";
  return APP_MENU.map((g) => ({
    ...g,
    children: g.children.filter((item) => !item.roles || item.roles.includes(r)),
  })).filter((g) => g.children.length > 0);
}

import { PrismaClient, SubnetPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.wxDepartment.upsert({
    where: { id: "wx-dept-root" },
    update: { name: "总公司", shortCode: "HQ" },
    create: { id: "wx-dept-root", name: "总公司", shortCode: "HQ", order: 0 },
  });

  await prisma.wxDepartment.upsert({
    where: { id: "wx-dept-fin" },
    update: { name: "财务部", shortCode: "FIN" },
    create: {
      id: "wx-dept-fin",
      name: "财务部",
      shortCode: "FIN",
      parentId: "wx-dept-root",
      order: 10,
    },
  });

  await prisma.wxUser.upsert({
    where: { userid: "zhangsan" },
    update: { name: "张三", active: true },
    create: { userid: "zhangsan", name: "张三", active: true },
  });

  const u = await prisma.wxUser.findUnique({ where: { userid: "zhangsan" } });
  if (u) {
    await prisma.wxUserDepartment.upsert({
      where: {
        userId_departmentId: { userId: u.id, departmentId: "wx-dept-fin" },
      },
      update: {},
      create: { userId: u.id, departmentId: "wx-dept-fin", order: 0 },
    });
  }

  const root = await prisma.assetCategory.upsert({
    where: { code: "ROOT" },
    update: {},
    create: { code: "ROOT", name: "全部资产", sortOrder: 0 },
  });

  await prisma.assetCategory.upsert({
    where: { code: "MACH" },
    update: {},
    create: {
      code: "MACH",
      name: "机器设备",
      parentId: root.id,
      sortOrder: 10,
      typeCode: "MACH",
    },
  });

  await prisma.assetCategory.upsert({
    where: { code: "IT-NB" },
    update: {},
    create: {
      code: "IT-NB",
      name: "IT-笔记本",
      parentId: root.id,
      sortOrder: 20,
      typeCode: "NB",
    },
  });

  await prisma.assetCategory.upsert({
    where: { code: "IT-SRV" },
    update: {},
    create: {
      code: "IT-SRV",
      name: "IT-服务器",
      parentId: root.id,
      sortOrder: 21,
      typeCode: "SRV",
    },
  });

  const site = await prisma.location.upsert({
    where: { code: "SITE-A" },
    update: {},
    create: { code: "SITE-A", name: "A厂区", sortOrder: 1 },
  });

  await prisma.location.upsert({
    where: { code: "WS-1" },
    update: {},
    create: { code: "WS-1", name: "一车间", parentId: site.id, sortOrder: 1 },
  });

  await prisma.costCenter.upsert({
    where: { code: "CC-DEFAULT" },
    update: {},
    create: { code: "CC-DEFAULT", name: "默认成本中心" },
  });

  await prisma.ledgerBook.upsert({
    where: { code: "LB-DEFAULT" },
    update: {},
    create: { code: "LB-DEFAULT", name: "默认账簿" },
  });

  const nbCat = await prisma.assetCategory.findUnique({ where: { code: "IT-NB" } });
  if (nbCat) {
    await prisma.namingPolicy.upsert({
      where: { id: "seed-policy-nb" },
      update: {
        template: "{site}-{dept}-{type}-{seq:4}",
        categoryId: nbCat.id,
      },
      create: {
        id: "seed-policy-nb",
        name: "笔记本默认命名",
        template: "{site}-{dept}-{type}-{seq:4}",
        scopeType: "ORG_UNIT",
        categoryId: nbCat.id,
        siteCode: "A",
        isDefault: true,
      },
    });
  }

  await prisma.subnet.upsert({
    where: { cidr: "203.0.113.10/24" },
    update: {},
    create: {
      cidr: "203.0.113.10/24",
      vlanId: "100",
      purpose: SubnetPurpose.OFFICE,
      gateway: "203.0.113.10",
      dns: "203.0.113.10",
      note: "办公网示例",
    },
  });

  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash, displayName: "系统管理员", isActive: true },
    create: {
      username: "admin",
      passwordHash: adminHash,
      displayName: "系统管理员",
      role: "admin",
    },
  });

  const opHash = await bcrypt.hash("operator123", 10);
  await prisma.user.upsert({
    where: { username: "operator" },
    update: { passwordHash: opHash, displayName: "业务操作员", role: "operator", isActive: true },
    create: {
      username: "operator",
      passwordHash: opHash,
      displayName: "业务操作员",
      role: "operator",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "app.title" },
    update: { value: "固定资产与 IT 一体化平台" },
    create: { key: "app.title", value: "固定资产与 IT 一体化平台", note: "页面标题/品牌名" },
  });

  await prisma.syncJobState.upsert({
    where: { id: "wx-department-sync" },
    update: {},
    create: { id: "wx-department-sync" },
  });
  await prisma.syncJobState.upsert({
    where: { id: "wx-user-sync" },
    update: {},
    create: { id: "wx-user-sync" },
  });
  await prisma.syncJobState.upsert({
    where: { id: "wx-scheduled-heartbeat" },
    update: {},
    create: { id: "wx-scheduled-heartbeat" },
  });

  await prisma.systemSetting.upsert({
    where: { key: "app.title" },
    update: {},
    create: { key: "app.title", value: "资产与终端一体化平台", note: "系统产品名称" },
  });

  await prisma.systemSetting.upsert({
    where: { key: "approval.transfer.steps" },
    update: {},
    create: { key: "approval.transfer.steps", value: "1", note: "调拨单需审批次数（1–10）" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "approval.disposal.steps" },
    update: {},
    create: { key: "approval.disposal.steps", value: "1", note: "处置单需审批次数" },
  });

  await prisma.systemSetting.upsert({
    where: { key: "server.management.global_write_enabled" },
    update: {},
    create: {
      key: "server.management.global_write_enabled",
      value: "false",
      note: "服务器管理：全局是否允许远程写（与角色 allowWrite 双开关）",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "server.management.global_automation_enabled" },
    update: {},
    create: {
      key: "server.management.global_automation_enabled",
      value: "false",
      note: "服务器管理：全局自动化总开关（与角色 allowAutomation 组合使用）",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "server.management.ldap_timeout_ms" },
    update: {},
    create: {
      key: "server.management.ldap_timeout_ms",
      value: "60000",
      note: "LDAP 客户端操作超时（毫秒），范围建议 5000–300000",
    },
  });

  console.log("Seed OK (默认登录: admin / admin123；operator / operator123)");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

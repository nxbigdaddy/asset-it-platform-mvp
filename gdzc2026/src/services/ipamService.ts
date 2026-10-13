import type { IpAddressStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function parseIPv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const oct = m.slice(1).map((x) => parseInt(x, 10));
  if (oct.some((n) => n > 255)) return null;
  return oct;
}

/** 简易 /24 内下一空闲 IP（生产环境应使用 ip-num 库与 CIDR 解析） */
export async function suggestNextFreeIp(subnetId: string): Promise<string | null> {
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
  if (!subnet?.cidr.endsWith("/24")) return null;
  const base = subnet.cidr.replace("/24", "").split(".").map((x) => parseInt(x, 10));
  if (base.length !== 4) return null;

  const used = new Set(
    (
      await prisma.ipAddress.findMany({
        where: { subnetId },
        select: { address: true },
      })
    ).map((r) => r.address),
  );

  for (let host = 10; host <= 250; host++) {
    const addr = `${base[0]}.${base[1]}.${base[2]}.${host}`;
    if (!used.has(addr)) return addr;
  }
  return null;
}

export async function allocateIp(
  subnetId: string,
  address: string,
  status: IpAddressStatus = "ALLOCATED",
): Promise<{ id: string }> {
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
  if (!subnet) throw new Error("网段不存在");

  const parsed = parseIPv4(address);
  if (!parsed) throw new Error("无效的 IPv4 地址");

  const existing = await prisma.ipAddress.findUnique({
    where: { subnetId_address: { subnetId, address } },
  });
  if (existing?.status === "ALLOCATED") {
    throw new Error("该 IP 已被分配");
  }
  if (existing) {
    return prisma.ipAddress
      .update({
        where: { id: existing.id },
        data: { status },
      })
      .then((r) => ({ id: r.id }));
  }

  const created = await prisma.ipAddress.create({
    data: { subnetId, address, status },
  });
  return { id: created.id };
}

export async function bindIpToAsset(
  assetId: string,
  ipAddressId: string,
  role: string,
  macAddress?: string,
  opts?: { actorUserId?: string },
): Promise<void> {
  await prisma.assetIpBinding.create({
    data: { assetId, ipAddressId, role: role || "data", macAddress },
  });
  await prisma.ipAllocationLog.create({
    data: {
      assetId,
      ipAddressId,
      action: "ALLOCATE",
      actorUserId: opts?.actorUserId,
    },
  });
}

export async function releaseIpBindingsForAsset(
  assetId: string,
  opts?: { actorUserId?: string },
): Promise<void> {
  const bindings = await prisma.assetIpBinding.findMany({ where: { assetId } });
  await prisma.$transaction(async (tx) => {
    for (const b of bindings) {
      await tx.ipAddress.update({
        where: { id: b.ipAddressId },
        data: { status: "FREE" },
      });
      await tx.ipAllocationLog.create({
        data: {
          assetId,
          ipAddressId: b.ipAddressId,
          action: "RELEASE",
          actorUserId: opts?.actorUserId,
        },
      });
    }
    await tx.assetIpBinding.deleteMany({ where: { assetId } });
  });
}

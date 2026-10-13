import { prisma } from "../lib/prisma.js";

export async function getSyncOverview() {
  const jobs = await prisma.syncJobState.findMany({ orderBy: { id: "asc" } });
  const recent = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return { jobs, recentAudit: recent };
}

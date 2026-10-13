import { prisma } from "../lib/prisma.js";

export async function writeAudit(
  entityType: string,
  entityId: string,
  action: string,
  detail?: unknown,
  actor?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      actor,
      detail: detail === undefined ? undefined : JSON.stringify(detail),
    },
  });
}

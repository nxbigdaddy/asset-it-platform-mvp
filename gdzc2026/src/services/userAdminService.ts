import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./auditService.js";

const ROLES = ["admin", "operator", "viewer"] as const;

export function listRoles() {
  return [...ROLES];
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      orgScopeJson: true,
      createdAt: true,
    },
  });
}

export async function createUser(input: {
  username: string;
  password: YOUR_PASSWORD;
  displayName?: string | null;
  role?: string;
  orgScopeJson?: string | null;
  actor?: string;
}) {
  if (!ROLES.includes(input.role as (typeof ROLES)[number])) {
    throw new Error("无效角色");
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const row = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      displayName: input.displayName ?? undefined,
      role: input.role ?? "operator",
      orgScopeJson: input.orgScopeJson ?? undefined,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      orgScopeJson: true,
      createdAt: true,
    },
  });
  await writeAudit("User", row.id, "CREATE", { username: row.username }, input.actor);
  return row;
}

export async function updateUser(
  id: string,
  input: {
    displayName?: string | null;
    role?: string;
    isActive?: boolean;
    password?: string;
    orgScopeJson?: string | null;
  },
  actor?: string,
) {
  if (input.role && !ROLES.includes(input.role as (typeof ROLES)[number])) {
    throw new Error("无效角色");
  }
  const passwordHash =
    input.password !== undefined ? await bcrypt.hash(input.password, 10) : undefined;
  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(passwordHash !== undefined && { passwordHash }),
      ...(input.orgScopeJson !== undefined && { orgScopeJson: input.orgScopeJson }),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      orgScopeJson: true,
      createdAt: true,
    },
  });
  await writeAudit("User", id, "UPDATE", { ...input, password: YOUR_PASSWORD ? "[redacted]" : undefined }, actor);
  return row;
}

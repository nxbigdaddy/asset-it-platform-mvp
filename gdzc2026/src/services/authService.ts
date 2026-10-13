import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me";

export type AuthUserPayload = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  orgScopeJson: string | null;
};

export async function loginUser(
  username: string,
  password: YOUR_PASSWORD,
): Promise<{ token: YOUR_SECRET; user: AuthUserPayload }> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      passwordHash: true,
      isActive: true,
      orgScopeJson: true,
    },
  });
  if (!user?.isActive) {
    throw new Error("用户名或密码错误");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new Error("用户名或密码错误");
  }
  const token = YOUR_SECRET
    { sub: user.id, u: user.username, r: user.role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      orgScopeJson: user.orgScopeJson,
    },
  };
}

export type JwtPayload = { sub: string; u: string; r?: string };

export function verifyToken(token: YOUR_SECRET): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function getUserById(id: string): Promise<AuthUserPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      orgScopeJson: true,
    },
  });
  if (!user?.isActive) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    orgScopeJson: user.orgScopeJson,
  };
}

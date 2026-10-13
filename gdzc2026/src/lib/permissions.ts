import type { FastifyReply, FastifyRequest } from "fastify";

export function assertNotViewer(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.authUser?.role === "viewer") {
    void reply.status(403).send({ error: "只读账号无写入权限" });
    return false;
  }
  return true;
}

export function assertAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.authUser?.role !== "admin") {
    void reply.status(403).send({ error: "需要管理员权限" });
    return false;
  }
  return true;
}

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type NamingContext = {
  site?: string;
  dept?: string;
  type?: string;
};

/** 花括号已去掉后的键，如 seq 或 seq:4 */
const SEQ_RE = /^seq(?::(\d+))?$/i;

/**
 * 解析模板占位符：{site} {dept} {type} {seq} 或 {seq:4}
 */
export function renderHostnameTemplate(
  template: string,
  ctx: NamingContext,
  seqValue: number,
): string {
  const parts = template.split(/(\{[^}]+\})/g).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (!part.startsWith("{")) {
      out.push(part);
      continue;
    }
    const key = part.slice(1, -1).trim();
    if (key === "site") {
      out.push(ctx.site ?? "");
    } else if (key === "dept") {
      out.push(ctx.dept ?? "");
    } else if (key === "type") {
      out.push(ctx.type ?? "");
    } else {
      const m = key.match(SEQ_RE);
      if (m) {
        const width = m[1] ? parseInt(m[1], 10) : 1;
        out.push(String(seqValue).padStart(width, "0"));
      } else {
        out.push(part);
      }
    }
  }
  return out.join("");
}

function buildScopeKey(policyId: string, orgUnitId: string | null, categoryId: string): string {
  return `${policyId}|${orgUnitId ?? "NONE"}|${categoryId}`;
}

/**
 * 在事务内递增序号并生成唯一主机名（库内唯一则重试序号+1，最多 50 次）
 */
export async function generateHostname(
  db: PrismaClient | Prisma.TransactionClient,
  policyId: string,
  orgUnitId: string | null,
  categoryId: string,
  ctx: NamingContext,
): Promise<{ hostname: string; seq: number }> {
  const policy = await db.namingPolicy.findUniqueOrThrow({ where: { id: policyId } });
  const scopeKey = buildScopeKey(policy.id, orgUnitId, categoryId);

  for (let attempt = 0; attempt < 50; attempt++) {
    const row = await db.namingSequence.upsert({
      where: {
        policyId_scopeKey: { policyId, scopeKey },
      },
      create: { policyId, scopeKey, lastValue: 0 },
      update: {},
    });

    const next = row.lastValue + 1;
    await db.namingSequence.update({
      where: { id: row.id },
      data: { lastValue: next },
    });

    const hostname = renderHostnameTemplate(policy.template, ctx, next);
    const dup = await db.asset.findFirst({
      where: { hostnameGenerated: hostname },
    });
    if (!dup) {
      return { hostname, seq: next };
    }
  }

  throw new Error("无法生成唯一主机名，请检查模板或清理冲突记录");
}

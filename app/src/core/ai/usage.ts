import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { usageEvents } from "@/core/db/schema";
import { assertWithinBudget } from "./budget";
import { aiLimits } from "./config";

export async function checkBudget(userId: string, now = new Date(), estimatedMicroEur = 50_000, kind: "enrich" | "ocr" = "enrich") {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [[today], [month]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(usageEvents).where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, kind), gte(usageEvents.createdAt, dayAgo))),
    db.select({ s: sql<number>`coalesce(sum(${usageEvents.estCostMicroEur}), 0)::bigint` }).from(usageEvents).where(gte(usageEvents.createdAt, monthStart)),
  ]);
  assertWithinBudget({ usedTodayByUser: today?.n ?? 0, usedMonthMicroEur: Number(month?.s ?? 0) }, kind === "ocr" ? { ...aiLimits(), perUserDaily: aiLimits().perUserDailyPages } : aiLimits(), estimatedMicroEur);
}

export async function recordUsage(e: { userId: string; kind: "ocr" | "detect" | "enrich"; provider: string; model: string; tokensIn: number; tokensOut: number; estCostMicroEur: number; ok: boolean }) {
  await db.insert(usageEvents).values({ ...e });
}

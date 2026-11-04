import { and, eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { inviteRedemptions, invites, profiles } from "@/core/db/schema";

export type RedeemResult = { ok: true } | { ok: false; reason: "invalid" | "exhausted" | "expired" | "blocked" };

/** Нормализира въведен код: главни букви, без интервали и тирета. */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Използва покана за потребител. Всичко е в една транзакция, редът на поканата е заключен,
 * така че един код с max_uses = 1 не може да се ползва два пъти едновременно.
 */
export async function redeemInvite(userId: string, rawCode: string): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (code.length < 6 || code.length > 40) return { ok: false, reason: "invalid" };

  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId)).for("update");
    if (!profile || profile.status === "blocked") return { ok: false, reason: "blocked" } as const;
    if (profile.status === "active") return { ok: true } as const;

    const [inv] = await tx.select().from(invites).where(eq(invites.code, code)).for("update");
    if (!inv) return { ok: false, reason: "invalid" } as const;
    if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" } as const;
    if (inv.usedCount >= inv.maxUses) return { ok: false, reason: "exhausted" } as const;

    await tx.insert(inviteRedemptions).values({ code, userId });
    await tx.update(invites).set({ usedCount: sql`${invites.usedCount} + 1` }).where(eq(invites.code, code));
    await tx.update(profiles).set({ status: "active" }).where(and(eq(profiles.id, userId), eq(profiles.status, "pending")));
    return { ok: true } as const;
  });
}

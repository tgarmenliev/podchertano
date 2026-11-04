import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/core/auth/auth";
import { db } from "@/core/db";
import { profiles } from "@/core/db/schema";

/** Текущият потребител и профилът му (или null). Кешира се в рамките на една заявка. */
export const getCurrent = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);
  return { user: session.user, profile: profile ?? null };
});

/** Пази екраните: без вход -> /login, без покана -> /invite, блокиран -> /login. */
export async function requireActive() {
  const cur = await getCurrent();
  if (!cur) redirect("/login");
  if (!cur.profile || cur.profile.status === "blocked") redirect("/login?e=blocked");
  if (cur.profile.status !== "active") redirect("/invite");
  return { user: cur.user, profile: cur.profile };
}

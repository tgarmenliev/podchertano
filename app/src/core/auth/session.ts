import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/core/auth/auth";
import { db } from "@/core/db";
import { profiles } from "@/core/db/schema";

const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Бърза проверка само за вход (обикновено без заявка към базата): за обвивките на екраните. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Текущият потребител и профилът му (или null). Кешира се в рамките на една заявка. */
export const getCurrent = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);
  return { user: session.user, profile: profile ?? null };
});

/** Пази екраните: без вход -> /login; блокиран или неактивен профил -> /login. */
export async function requireActive() {
  const cur = await getCurrent();
  if (!cur) redirect("/login");
  if (!cur.profile || cur.profile.status !== "active") redirect("/login?e=blocked");
  return { user: cur.user, profile: cur.profile };
}

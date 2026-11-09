"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/core/auth/session";
import { db } from "@/core/db";
import { profiles } from "@/core/db/schema";

const ALLOWED = [5, 8, 12, 20];

export async function setDailyNewAction(n: number) {
  const { user } = await requireActive();
  if (!ALLOWED.includes(n)) return;
  await db.update(profiles).set({ dailyNewWords: n }).where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
}

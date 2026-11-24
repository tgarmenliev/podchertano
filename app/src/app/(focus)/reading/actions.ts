"use server";

import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { completeReading, ensureReading, reportQuestion, ReadingError, type Completion } from "@/modules/reading/service";

export type CreateOut = { ok: true; id: string } | { ok: false; code: "no_words" | "limit" | "disabled" | "failed"; error: string };

/** Връща непрочетения текст или прави нов (около 15–25 секунди). */
export async function createReadingAction(): Promise<CreateOut> {
  const { user } = await requireActive();
  try {
    const r = await ensureReading(user.id);
    return { ok: true, id: r.id };
  } catch (e) {
    if (e instanceof ReadingError) return { ok: false, code: e.code, error: e.message };
    return { ok: false, code: "failed", error: "Не успях да направя текст. Опитай пак след малко." };
  }
}

const doneSchema = z.object({
  id: z.uuid(),
  answers: z.array(z.number().int().min(-1).max(3)).max(8),
  peeked: z.array(z.uuid()).max(20),
  durationMs: z.number().int().min(0).max(3_600_000).nullable(),
});

export type CompleteOut = { ok: true; result: Completion } | { ok: false; error: string };

export async function completeReadingAction(raw: unknown): Promise<CompleteOut> {
  const { user } = await requireActive();
  const p = doneSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Невалидни данни." };
  try {
    return { ok: true, result: await completeReading(user.id, p.data.id, p.data) };
  } catch {
    return { ok: false, error: "Не успях да запиша резултата." };
  }
}

export async function reportQuestionAction(id: string, index: number): Promise<void> {
  const { user } = await requireActive();
  const p = z.object({ id: z.uuid(), index: z.number().int().min(0).max(7) }).safeParse({ id, index });
  if (p.success) await reportQuestion(user.id, p.data.id, p.data.index);
}

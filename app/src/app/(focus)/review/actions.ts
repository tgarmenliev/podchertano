"use server";

import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { submitReview } from "@/modules/review/service";

const schema = z.object({
  logId: z.uuid(),
  cardId: z.uuid(),
  mode: z.enum(["recognize", "type_from_bg", "cloze"]),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  correct: z.boolean(),
  typedAnswer: z.string().max(200).nullable(),
  durationMs: z.number().int().min(0).max(3_600_000).nullable(),
  reviewedAt: z.iso.datetime(),
});

export async function submitReviewAction(raw: unknown) {
  const { user } = await requireActive();
  const i = schema.parse(raw);
  await submitReview(user.id, { ...i, reviewedAt: new Date(i.reviewedAt) });
}

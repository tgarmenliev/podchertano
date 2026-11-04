import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { encounters, profiles, reviewLogs, srsCards, vocabItems } from "@/core/db/schema";
import { dayKey, startOfDay, streak } from "@/core/srs/day";
import { review, statusOf, type CardRow } from "@/core/srs/scheduler";

export type Mode = "recognize" | "type_from_bg" | "cloze";

export type QueueItem = {
  cardId: string;
  mode: Mode;
  isNew: boolean;
  lemma: string;
  phrase: string | null;
  pos: string;
  translationBg: string;
  translationAltBg: string | null;
  meaningBg: string | null;
  exampleEn: string | null;
  /** приети отговори (формата от текста, основната форма, фразата) */
  answers: string[];
  /** изречението: за cloze е с ___ на мястото на думата, иначе е оригиналното */
  sentence: string | null;
  surface: string | null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Заменя първата поява на думата с ___; null, ако не се намери. */
export function maskSentence(sentence: string, surface: string): string | null {
  const re = new RegExp(`(?<![A-Za-z'])${esc(surface)}(?![A-Za-z'])`, "i");
  return re.test(sentence) ? sentence.replace(re, "___") : null;
}

/** Режимът зависи от етапа на картата и от това дали има изречение. */
export function pickMode(card: { state: number; reps: number }, hasCloze: boolean): Mode {
  if (card.state === 0) return "recognize";
  if (!hasCloze) return "type_from_bg";
  return card.state === 2 && card.reps % 2 === 0 ? "type_from_bg" : "cloze";
}

export async function getQueue(userId: string, now = new Date(), opts: { cap?: number } = {}): Promise<QueueItem[]> {
  const cap = opts.cap ?? 25;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  const tz = profile?.timezone ?? "Europe/Sofia";
  const sod = startOfDay(now, tz);

  const introducedToday = await db
    .select({ n: sql<number>`count(distinct ${reviewLogs.cardId})::int` })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, sod), sql`(${reviewLogs.cardStateBefore}->>'state') = '0'`));
  const newAllowed = Math.max(0, (profile?.dailyNewWords ?? 8) - (introducedToday[0]?.n ?? 0));

  const due = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), eq(srsCards.suspended, false), ne(srsCards.state, 0), lte(srsCards.due, now)))
    .orderBy(asc(srsCards.due))
    .limit(cap);
  const fresh =
    newAllowed > 0
      ? await db
          .select({ c: srsCards })
          .from(srsCards)
          .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
          .where(and(eq(srsCards.userId, userId), eq(srsCards.suspended, false), eq(srsCards.state, 0)))
          .orderBy(asc(vocabItems.createdAt))
          .limit(Math.min(newAllowed, Math.max(0, cap - due.length)))
          .then((r) => r.map((x) => x.c))
      : [];

  const cards = [...due, ...fresh];
  if (!cards.length) return [];
  const items: QueueItem[] = [];
  for (const c of cards) {
    const [w] = await db.select().from(vocabItems).where(eq(vocabItems.id, c.itemId));
    if (!w) continue;
    const [enc] = await db.select().from(encounters).where(eq(encounters.vocabItemId, w.id)).orderBy(desc(encounters.createdAt)).limit(1);
    const target = w.phrase ?? w.lemma;
    const surface = enc?.surfaceForm ?? null;
    const masked = enc ? maskSentence(enc.sentence, enc.surfaceForm) : null;
    const mode = pickMode(c, !!masked);
    items.push({
      cardId: c.id,
      mode,
      isNew: c.state === 0,
      lemma: w.lemma,
      phrase: w.phrase,
      pos: w.pos,
      translationBg: w.translationBg,
      translationAltBg: w.translationAltBg,
      meaningBg: w.meaningBg,
      exampleEn: w.exampleEn,
      answers: [...new Set([target, ...(surface ? [surface] : [])])],
      sentence: mode === "cloze" ? masked : (enc?.sentence ?? null),
      surface,
    });
  }
  return items;
}

export type ReviewInput = {
  logId: string; // uuid от клиента: така повторното изпращане е безопасно
  cardId: string;
  mode: Mode;
  rating: 1 | 2 | 3 | 4;
  correct: boolean;
  typedAnswer?: string | null;
  durationMs?: number | null;
  reviewedAt: Date;
};

/** Записва преглеждане и подава картата през FSRS. Идемпотентно по logId. */
export async function submitReview(userId: string, input: ReviewInput, now = new Date()) {
  return db.transaction(async (tx) => {
    const [card] = await tx.select().from(srsCards).where(and(eq(srsCards.id, input.cardId), eq(srsCards.userId, userId))).for("update");
    if (!card) throw new Error("Картата не е намерена");
    // времето не може да е в бъдещето (грешен часовник) или преди последния преглед
    let at = input.reviewedAt.getTime() > now.getTime() ? now : input.reviewedAt;
    if (card.lastReview && at.getTime() < card.lastReview.getTime()) at = card.lastReview;

    const inserted = await tx
      .insert(reviewLogs)
      .values({
        id: input.logId,
        userId,
        cardId: card.id,
        mode: input.mode,
        rating: input.rating,
        correct: input.correct,
        typedAnswer: input.typedAnswer?.slice(0, 200) ?? null,
        durationMs: input.durationMs ?? null,
        reviewedAt: at,
        cardStateBefore: { state: card.state, stability: card.stability, difficulty: card.difficulty, due: card.due, reps: card.reps, lapses: card.lapses },
      })
      .onConflictDoNothing()
      .returning({ id: reviewLogs.id });
    if (!inserted.length) return { applied: false as const };

    const next = review(card as CardRow, input.rating, at);
    await tx.update(srsCards).set(next).where(eq(srsCards.id, card.id));
    await tx.update(vocabItems).set({ status: statusOf(next) }).where(eq(vocabItems.id, card.itemId));
    return { applied: true as const, due: next.due };
  });
}

/** Числата за екраните „Днес“ и „Напредък“. */
export async function getStats(userId: string, now = new Date()) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  const tz = profile?.timezone ?? "Europe/Sofia";
  const cards = await db.select({ state: srsCards.state, stability: srsCards.stability, due: srsCards.due, suspended: srsCards.suspended }).from(srsCards).where(eq(srsCards.userId, userId));
  const counts = { new: 0, learning: 0, known: 0 };
  let dueNow = 0;
  for (const c of cards) {
    counts[statusOf(c)]++;
    if (!c.suspended && c.state !== 0 && c.due <= now) dueNow++;
  }
  const since = new Date(now.getTime() - 400 * 24 * 3600_000);
  const logs = await db.select({ at: reviewLogs.reviewedAt, correct: reviewLogs.correct }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since)));

  const perDay = new Map<string, number>();
  for (const l of logs) perDay.set(dayKey(l.at, tz), (perDay.get(dayKey(l.at, tz)) ?? 0) + 1);
  const days: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * 24 * 3600_000), tz);
    days.push({ day: k, n: perDay.get(k) ?? 0 });
  }
  const month = logs.filter((l) => l.at.getTime() >= now.getTime() - 30 * 24 * 3600_000);
  const retention = month.length >= 10 ? Math.round((100 * month.filter((l) => l.correct).length) / month.length) : null;

  const sod = startOfDay(now, tz);
  const introduced = await db
    .select({ n: sql<number>`count(distinct ${reviewLogs.cardId})::int` })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, sod), sql`(${reviewLogs.cardStateBefore}->>'state') = '0'`));
  const newAvailable = Math.max(0, Math.min(counts.new, (profile?.dailyNewWords ?? 8) - (introduced[0]?.n ?? 0)));

  return {
    counts,
    total: cards.length,
    dueNow,
    newAvailable,
    streak: streak(logs.map((l) => l.at), tz, now),
    days,
    retention,
    reviewsToday: perDay.get(dayKey(now, tz)) ?? 0,
  };
}

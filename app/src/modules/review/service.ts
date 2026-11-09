import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { encounters, profiles, reviewLogs, srsCards, vocabItems } from "@/core/db/schema";
import { dayKey, startOfDay, streak } from "@/core/srs/day";
import { review, statusOf, type CardRow } from "@/core/srs/scheduler";

export type Mode = "recognize" | "type_from_bg" | "cloze" | "choice" | "listen";

export type QueueItem = {
  cardId: string;
  mode: Mode;
  isNew: boolean;
  /** нова дума: първо кратко запознанство (без оценка), после въпрос след няколко други карти */
  intro: boolean;
  lemma: string;
  phrase: string | null;
  pos: string;
  translationBg: string;
  translationAltBg: string | null;
  meaningBg: string | null;
  exampleEn: string | null;
  /** приети отговори (формата от текста, основната форма, фразата) */
  answers: string[];
  /** за режим „избор“: 4 варианта (верният е вътре), разбъркани */
  options: string[] | null;
  /** оригиналното изречение от страницата */
  sentence: string | null;
  /** същото изречение с ___ на мястото на думата (за режим cloze) */
  cloze: string | null;
  surface: string | null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Заменя първата поява на думата с ___; null, ако не се намери. */
export function maskSentence(sentence: string, surface: string): string | null {
  const re = new RegExp(`(?<![A-Za-z'])${esc(surface)}(?![A-Za-z'])`, "i");
  return re.test(sentence) ? sentence.replace(re, "___") : null;
}

/**
 * Режимът зависи от етапа на картата:
 * нова → избор от 4 (ако има достатъчно други думи за варианти), иначе изречение/писане;
 * в учене → изречение или избор; в преговор → писане, изречение и слушане на смени (по броя прегледи).
 */
export function pickMode(card: { state: number; reps: number }, hasCloze: boolean, canChoice = false): Mode {
  if (card.state === 0) return canChoice ? "choice" : hasCloze ? "cloze" : "type_from_bg";
  if (card.state !== 2) {
    if (hasCloze) return card.reps % 2 === 0 ? "cloze" : canChoice ? "choice" : "cloze";
    return canChoice ? "choice" : "type_from_bg";
  }
  const turn = card.reps % 3;
  if (turn === 2) return "listen";
  if (turn === 1 && hasCloze) return "cloze";
  return "type_from_bg";
}

const shuffle = <T,>(a: T[]): T[] => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

/** Три грешни варианта: най-напред от същия вид дума, после от останалите; null, ако не стигат. */
export function pickDistractors(target: string, accepted: string[], pool: { target: string; pos: string }[], pos: string): string[] | null {
  const bad = new Set(accepted.map((x) => x.toLowerCase()));
  bad.add(target.toLowerCase());
  const ok = pool.filter((p) => !bad.has(p.target.toLowerCase()));
  const uniq = (l: typeof ok) => [...new Map(l.map((p) => [p.target.toLowerCase(), p.target])).values()];
  const same = shuffle(uniq(ok.filter((p) => p.pos === pos)));
  const rest = shuffle(uniq(ok.filter((p) => p.pos !== pos))).filter((t) => !same.some((s) => s.toLowerCase() === t.toLowerCase()));
  const out = [...same, ...rest].slice(0, 3);
  return out.length === 3 ? out : null;
}

/** Смесва нови карти между чакащите: след всеки две стари идва една нова (останалите отзад). */
export function interleave<T>(due: T[], fresh: T[]): T[] {
  const out: T[] = [];
  let d = 0;
  let f = 0;
  while (d < due.length || f < fresh.length) {
    for (let k = 0; k < 2 && d < due.length; k++) out.push(due[d++]);
    if (f < fresh.length) out.push(fresh[f++]);
    else while (d < due.length) out.push(due[d++]);
  }
  return out;
}

/**
 * opts.more: още нови думи отгоре на дневния лимит (бутон „Още“).
 * opts.practice: упражнение върху най-слабите вече учени думи; не променя графика.
 */
export async function getQueue(userId: string, now = new Date(), opts: { cap?: number; more?: number; practice?: boolean } = {}): Promise<QueueItem[]> {
  const cap = opts.cap ?? 25 + (opts.more ?? 0);
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  const tz = profile?.timezone ?? "Europe/Sofia";
  const sod = startOfDay(now, tz);

  if (opts.practice) return practiceQueue(userId, now);

  const [introducedToday, due] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${reviewLogs.cardId})::int` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, sod), sql`(${reviewLogs.cardStateBefore}->>'state') = '0'`)),
    db
      .select()
      .from(srsCards)
      .where(and(eq(srsCards.userId, userId), eq(srsCards.suspended, false), ne(srsCards.state, 0), lte(srsCards.due, now)))
      .orderBy(asc(srsCards.due))
      .limit(cap),
  ]);
  const newAllowed = Math.max(0, (profile?.dailyNewWords ?? 8) - (introducedToday[0]?.n ?? 0)) + (opts.more ?? 0);
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

  return buildItems(userId, interleave(due, fresh));
}

/** Най-слабите вече учени думи, които още не са за преговор: за свободно упражнение. */
async function practiceQueue(userId: string, now: Date): Promise<QueueItem[]> {
  const cards = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), eq(srsCards.suspended, false), ne(srsCards.state, 0), gte(srsCards.due, now)))
    .orderBy(asc(srsCards.stability))
    .limit(10);
  return buildItems(userId, cards);
}

async function buildItems(userId: string, cards: (typeof srsCards.$inferSelect)[]): Promise<QueueItem[]> {
  if (!cards.length) return [];
  const ids = cards.map((c) => c.itemId);
  // заявки за всички карти наведнъж (вместо по няколко на карта): по-бързо при далечна база
  const [words, encs, everyWord] = await Promise.all([
    db.select().from(vocabItems).where(inArray(vocabItems.id, ids)),
    db.select().from(encounters).where(inArray(encounters.vocabItemId, ids)).orderBy(desc(encounters.createdAt)),
    db.select({ id: vocabItems.id, lemma: vocabItems.lemma, phrase: vocabItems.phrase, pos: vocabItems.pos, tr: vocabItems.translationBg }).from(vocabItems).where(eq(vocabItems.userId, userId)),
  ]);
  const wordById = new Map(words.map((w) => [w.id, w]));
  const latestEnc = new Map<string, (typeof encs)[number]>();
  for (const e of encs) if (!latestEnc.has(e.vocabItemId)) latestEnc.set(e.vocabItemId, e);
  // думи със същия български превод са взаимозаменяеми (big/large): приемат се като верен отговор
  const sameTr = new Map<string, { id: string; target: string }[]>();
  for (const v of everyWord) {
    const k = v.tr.trim().toLowerCase();
    sameTr.set(k, [...(sameTr.get(k) ?? []), { id: v.id, target: v.phrase ?? v.lemma }]);
  }

  const pool = everyWord.map((v) => ({ id: v.id, target: v.phrase ?? v.lemma, pos: v.pos }));
  const items: QueueItem[] = [];
  for (const c of cards) {
    const w = wordById.get(c.itemId);
    if (!w) continue;
    const enc = latestEnc.get(w.id);
    const target = w.phrase ?? w.lemma;
    const surface = enc?.surfaceForm ?? null;
    const masked = enc ? maskSentence(enc.sentence, enc.surfaceForm) : null;
    const others = (sameTr.get(w.translationBg.trim().toLowerCase()) ?? []).filter((o) => o.id !== w.id).map((o) => o.target);
    const accepted = [...new Set([target, ...(surface ? [surface] : []), ...others])];
    const wrongOnes = pickDistractors(target, accepted, pool.filter((p) => p.id !== w.id), w.pos);
    const mode = pickMode(c, !!masked, !!wrongOnes);
    items.push({
      cardId: c.id,
      mode,
      isNew: c.state === 0,
      intro: c.state === 0,
      lemma: w.lemma,
      phrase: w.phrase,
      pos: w.pos,
      translationBg: w.translationBg,
      translationAltBg: w.translationAltBg,
      meaningBg: w.meaningBg,
      exampleEn: w.exampleEn,
      answers: accepted,
      options: mode === "choice" && wrongOnes ? shuffle([target, ...wrongOnes]) : null,
      sentence: enc?.sentence ?? null,
      cloze: masked,
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

/** За крайния екран на преговора: колко думи чакат до края на утрешния ден и серията. */
export async function getSummary(userId: string, now = new Date()) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  const tz = profile?.timezone ?? "Europe/Sofia";
  const tomorrow = startOfDay(new Date(now.getTime() + 30 * 3600_000), tz);
  const dayAfter = startOfDay(new Date(tomorrow.getTime() + 30 * 3600_000), tz);
  const [[due], stats] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(srsCards)
      .where(and(eq(srsCards.userId, userId), eq(srsCards.suspended, false), ne(srsCards.state, 0), lte(srsCards.due, dayAfter))),
    getStats(userId, now),
  ]);
  return { dueTomorrow: due?.n ?? 0, streak: stats.streak, reviewsToday: stats.reviewsToday, known: stats.counts.known, total: stats.total };
}

/** Числата за екраните „Днес“ и „Напредък“. */
export async function getStats(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 400 * 24 * 3600_000);
  const [[profile], cards, logs] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, userId)),
    db.select({ state: srsCards.state, stability: srsCards.stability, due: srsCards.due, suspended: srsCards.suspended }).from(srsCards).where(eq(srsCards.userId, userId)),
    db.select({ at: reviewLogs.reviewedAt, correct: reviewLogs.correct, cardId: reviewLogs.cardId, before: reviewLogs.cardStateBefore }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since))),
  ]);
  const tz = profile?.timezone ?? "Europe/Sofia";
  const counts = { new: 0, learning: 0, known: 0 };
  let dueNow = 0;
  for (const c of cards) {
    counts[statusOf(c)]++;
    if (!c.suspended && c.state !== 0 && c.due <= now) dueNow++;
  }

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
  const introducedIds = new Set(logs.filter((l) => l.at >= sod && (l.before as { state?: number } | null)?.state === 0).map((l) => l.cardId));
  const newAvailable = Math.max(0, Math.min(counts.new, (profile?.dailyNewWords ?? 8) - introducedIds.size));

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

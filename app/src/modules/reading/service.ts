import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { aiEnabled, aiLimits } from "@/core/ai/config";
import { generateReading, type GlossaryItem, type ReadingQuestion, findForm } from "@/core/ai/reading";
import { checkBudget, recordUsage } from "@/core/ai/usage";
import { db } from "@/core/db";
import { encounters, readings, srsCards, vocabItems } from "@/core/db/schema";
import { submitReview } from "@/modules/review/service";
import { tierOf } from "./lexicon";
import { pickReadingWords, type Candidate } from "./priority";

export type ReadingWord = { itemId: string; target: string; form: string; translationBg: string; translationAltBg: string | null; meaningBg: string | null };

type Extra = { translationAltBg: string | null; meaningBg: string | null; seen: string | null };

/** Всички думи на ученика като кандидати за текст (с картата и броя страници, на които е срещната). */
export async function loadCandidates(userId: string): Promise<{ cands: Candidate[]; extra: Map<string, Extra> }> {
  const since = new Date(Date.now() - 3 * 24 * 3600_000);
  const [rows, encs, recent] = await Promise.all([
    db
      .select({ v: vocabItems, c: srsCards })
      .from(vocabItems)
      .innerJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.itemKind, "vocab")))
      .where(eq(vocabItems.userId, userId)),
    db.select({ itemId: encounters.vocabItemId, sourceId: encounters.sourceId, sentence: encounters.sentence }).from(encounters).where(eq(encounters.userId, userId)).orderBy(desc(encounters.createdAt)),
    db.select({ words: readings.words }).from(readings).where(and(eq(readings.userId, userId), gte(readings.createdAt, since))),
  ]);
  const recentIds = new Set(recent.flatMap((r) => (r.words as ReadingWord[]).map((w) => w.itemId)));
  const pages = new Map<string, Set<string>>();
  const seen = new Map<string, string>();
  for (const e of encs) {
    if (e.sourceId) pages.set(e.itemId, (pages.get(e.itemId) ?? new Set()).add(e.sourceId));
    if (!seen.has(e.itemId) && e.sentence.length <= 220) seen.set(e.itemId, e.sentence);
  }
  const extra = new Map<string, Extra>();
  const cands: Candidate[] = rows.map(({ v, c }) => {
    extra.set(v.id, { translationAltBg: v.translationAltBg, meaningBg: v.meaningBg, seen: seen.get(v.id) ?? null });
    return {
      itemId: v.id,
      target: v.phrase ?? v.lemma,
      pos: v.pos,
      translationBg: v.translationBg,
      state: c.state,
      stability: c.stability,
      lapses: c.lapses,
      pages: pages.get(v.id)?.size ?? 0,
      suspended: c.suspended,
      recentlyRead: recentIds.has(v.id) && c.lapses === 0,
    };
  });
  return { cands, extra };
}

const dayKeyUtc = (d: Date) => d.toISOString().slice(0, 10);

export class ReadingError extends Error {
  constructor(
    public code: "no_words" | "limit" | "disabled" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export async function latestUnread(userId: string) {
  const [r] = await db.select().from(readings).where(and(eq(readings.userId, userId), isNull(readings.completedAt))).orderBy(desc(readings.createdAt)).limit(1);
  return r ?? null;
}

/** За картата на „Днес“: има ли готов текст, може ли да се направи нов. */
export async function readingStatus(userId: string, now = new Date()) {
  if (!aiEnabled()) return { enabled: false as const };
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [unread, [made], [done], { cands }] = await Promise.all([
    latestUnread(userId),
    db.select({ n: sql<number>`count(*)::int` }).from(readings).where(and(eq(readings.userId, userId), gte(readings.createdAt, dayAgo))),
    db.select({ n: sql<number>`count(*)::int` }).from(readings).where(and(eq(readings.userId, userId), sql`${readings.completedAt} is not null`)),
    loadCandidates(userId),
  ]);
  const enough = pickReadingWords(cands, { seed: dayKeyUtc(now), tierOf }) !== null;
  return {
    enabled: true as const,
    unread: unread ? { id: unread.id, title: unread.title, words: (unread.words as ReadingWord[]).length } : null,
    canMake: enough && (made?.n ?? 0) < aiLimits().perUserDailyReadings,
    notEnoughWords: !enough,
    completed: done?.n ?? 0,
  };
}

const inflight = new Map<string, Promise<{ id: string; created: boolean }>>();

/** Връща непрочетения текст или прави нов. При двойно натискане не се плаща два пъти (една заявка на потребител наведнъж). */
export function ensureReading(userId: string, now = new Date()): Promise<{ id: string; created: boolean }> {
  const running = inflight.get(userId);
  if (running) return running;
  const p = makeReading(userId, now).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

async function makeReading(userId: string, now: Date): Promise<{ id: string; created: boolean }> {
  if (!aiEnabled()) throw new ReadingError("disabled", "Текстовете не са включени.");
  const existing = await latestUnread(userId);
  if (existing) return { id: existing.id, created: false };

  try {
    await checkBudget(userId, now, 30_000, "reading");
  } catch (e) {
    throw new ReadingError("limit", e instanceof Error && /месечен|спряно/.test(e.message) ? "Текстовете са временно спрени. Опитай по-късно." : "Днес стигнаха текстове. Утре ще има нов.");
  }

  const { cands, extra } = await loadCandidates(userId);
  const picked = pickReadingWords(cands, { seed: dayKeyUtc(now), tierOf });
  if (!picked) throw new ReadingError("no_words", "Добави още няколко думи в речника и ще направя текст с тях.");

  const glossary: GlossaryItem[] = picked.map((c, id) => ({ id, target: c.target, pos: c.pos, bg: c.translationBg, seen: extra.get(c.itemId)?.seen ?? null }));
  let gen;
  try {
    gen = await generateReading(glossary);
  } catch (e) {
    const err = e as Error & { costMicroEur?: number; tokensIn?: number; tokensOut?: number };
    await recordUsage({ userId, kind: "reading", provider: "openai", model: aiLimits().model, tokensIn: err.tokensIn ?? 0, tokensOut: err.tokensOut ?? 0, estCostMicroEur: err.costMicroEur ?? 0, ok: false }).catch(() => {});
    throw new ReadingError("failed", /Опитай пак/.test(err.message) ? err.message : "Не успях да направя текст. Опитай пак след малко.");
  }
  await recordUsage({ userId, kind: "reading", provider: "openai", model: gen.model, tokensIn: gen.tokensIn, tokensOut: gen.tokensOut, estCostMicroEur: gen.estCostMicroEur, ok: true });

  const body = gen.reading.paragraphs.join("\n\n");
  const words: ReadingWord[] = gen.reading.used.map((u) => {
    const c = picked[u.id];
    const x = extra.get(c.itemId);
    // формата така, както е в текста (с главна/малка буква)
    const at = findForm(body, u.form);
    return { itemId: c.itemId, target: c.target, form: at ? body.slice(at.start, at.end) : u.form, translationBg: c.translationBg, translationAltBg: x?.translationAltBg ?? null, meaningBg: x?.meaningBg ?? null };
  });

  return db.transaction(async (tx) => {
    // ако междувременно друга заявка е направила текст, ползваме нея
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"reading:" + userId}))`);
    const [again] = await tx.select({ id: readings.id }).from(readings).where(and(eq(readings.userId, userId), isNull(readings.completedAt))).orderBy(desc(readings.createdAt)).limit(1);
    if (again) return { id: again.id, created: false };
    const [row] = await tx
      .insert(readings)
      .values({ userId, title: gen.reading.title, body, words, questions: gen.reading.questions, model: gen.model, promptVersion: "reading.v1", costMicroEur: gen.estCostMicroEur })
      .returning({ id: readings.id });
    return { id: row.id, created: true };
  });
}

export async function getReading(userId: string, id: string) {
  const [r] = await db.select().from(readings).where(and(eq(readings.id, id), eq(readings.userId, userId))).limit(1);
  return r ?? null;
}

/** Стабилен uuid за един преглед от четене: повторно изпращане не прави втори преглед. */
export function reviewLogId(readingId: string, itemId: string): string {
  const h = createHash("sha1").update(`${readingId}:${itemId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Оценка за преговор от четене: докоснал е превода → „не я помня“;
 * не е докосвал и думата вече е била учена → „добре“; нова дума, която е минала покрай нея → „трудно“ (още не е доказала нищо).
 */
export function ratingForReading(peeked: boolean, state: number): 1 | 2 | 3 {
  if (peeked) return 1;
  return state === 0 ? 2 : 3;
}

export type Completion = { score: number; total: number; recognized: number; peeked: ReadingWord[]; alreadyDone: boolean };

export async function completeReading(userId: string, id: string, input: { answers: number[]; peeked: string[]; durationMs: number | null }, now = new Date()): Promise<Completion> {
  const r = await getReading(userId, id);
  if (!r) throw new Error("Текстът не е намерен");
  const words = r.words as ReadingWord[];
  const questions = r.questions as ReadingQuestion[];
  const summarize = (answers: number[], peekedIds: string[], alreadyDone: boolean): Completion => {
    const set = new Set(peekedIds);
    return { score: answers.filter((a, i) => a === questions[i]?.answer).length, total: questions.length, recognized: words.filter((w) => !set.has(w.itemId)).length, peeked: words.filter((w) => set.has(w.itemId)), alreadyDone };
  };
  if (r.completedAt) return summarize((r.answers as number[]) ?? [], (r.peeked as string[]) ?? [], true);

  const answers = questions.map((_, i) => {
    const a = input.answers[i];
    return Number.isInteger(a) && a >= 0 && a <= 3 ? a : -1;
  });
  const valid = new Set(words.map((w) => w.itemId));
  const peeked = [...new Set(input.peeked)].filter((x) => valid.has(x));
  const done = summarize(answers, peeked, false);

  const [updated] = await db
    .update(readings)
    .set({ completedAt: now, answers, score: done.score, peeked, durationMs: input.durationMs != null ? Math.min(Math.max(0, Math.round(input.durationMs)), 3_600_000) : null })
    .where(and(eq(readings.id, id), eq(readings.userId, userId), isNull(readings.completedAt)))
    .returning({ id: readings.id });
  if (!updated) return summarize(answers, peeked, true); // друг заявка вече го е завършила

  // думите от текста се броят като преговор (без писане)
  const cards = await db.select({ id: srsCards.id, itemId: srsCards.itemId, state: srsCards.state }).from(srsCards).where(and(eq(srsCards.userId, userId), inArray(srsCards.itemId, words.map((w) => w.itemId))));
  const byItem = new Map(cards.map((c) => [c.itemId, c]));
  for (const w of words) {
    const card = byItem.get(w.itemId);
    if (!card) continue;
    const wasPeeked = peeked.includes(w.itemId);
    try {
      await submitReview(userId, { logId: reviewLogId(id, w.itemId), cardId: card.id, mode: "reading", rating: ratingForReading(wasPeeked, card.state), correct: !wasPeeked, durationMs: null, reviewedAt: now }, now);
    } catch {
      // един неуспешен преглед не бива да губи резултата от четенето
    }
  }
  return done;
}

export async function reportQuestion(userId: string, id: string, index: number) {
  const r = await getReading(userId, id);
  if (!r || !Number.isInteger(index) || index < 0 || index >= (r.questions as unknown[]).length) return;
  const cur = (r.reported as number[]) ?? [];
  if (cur.includes(index)) return;
  await db.update(readings).set({ reported: [...cur, index] }).where(and(eq(readings.id, id), eq(readings.userId, userId)));
}

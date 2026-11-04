import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { encounters, srsCards, vocabItems } from "@/core/db/schema";
import { newCardRow, statusOf } from "@/core/srs/scheduler";

export type NewWord = {
  lemma: string;
  pos?: string;
  phrase?: string | null;
  phraseKind?: "phrasal_verb" | "idiom" | "collocation" | null;
  translationBg: string;
  translationAltBg?: string | null;
  meaningBg?: string | null;
  definitionEn?: string | null;
  exampleEn?: string | null;
  notes?: string | null;
  /** изречението, в което е срещната думата, и формата ѝ там */
  sentence?: string | null;
  surfaceForm?: string | null;
  sourceId?: string | null;
  aiModel?: string | null;
};

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const orNull = (s: string | null | undefined) => clean(s) || null;

/** Добавя дума в речника и ѝ прави карта за повторение. Дублирана дума само получава нов контекст. */
export async function addWord(userId: string, w: NewWord) {
  const lemma = clean(w.lemma).toLowerCase();
  const translation = clean(w.translationBg);
  if (!lemma || !translation) throw new Error("Нужни са дума и превод");
  const phrase = orNull(w.phrase)?.toLowerCase() ?? null;
  const pos = clean(w.pos);

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(vocabItems)
      .values({
        userId,
        lemma,
        pos,
        phrase,
        phraseKind: w.phraseKind ?? null,
        translationBg: translation,
        translationAltBg: orNull(w.translationAltBg),
        meaningBg: orNull(w.meaningBg),
        definitionEn: orNull(w.definitionEn),
        exampleEn: orNull(w.exampleEn),
        notes: orNull(w.notes),
        aiModel: w.aiModel ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: vocabItems.id });

    let id: string;
    let created = false;
    if (inserted.length) {
      id = inserted[0].id;
      created = true;
    } else {
      const [ex] = await tx
        .select({ id: vocabItems.id })
        .from(vocabItems)
        .where(and(eq(vocabItems.userId, userId), eq(vocabItems.lemma, lemma), eq(vocabItems.pos, pos), sql`coalesce(${vocabItems.phrase}, '') = ${phrase ?? ""}`))
        .limit(1);
      id = ex.id;
    }

    const sentence = orNull(w.sentence);
    if (sentence) {
      await tx.insert(encounters).values({ userId, vocabItemId: id, sourceId: w.sourceId ?? null, surfaceForm: clean(w.surfaceForm) || phrase || lemma, sentence });
    }
    if (created) {
      const c = newCardRow();
      await tx.insert(srsCards).values({ userId, itemKind: "vocab", itemId: id, ...c }).onConflictDoNothing();
    }
    return { id, created };
  });
}

export async function listWords(userId: string, opts: { q?: string; status?: "new" | "learning" | "known" } = {}) {
  const q = opts.q?.trim();
  const rows = await db
    .select({ item: vocabItems, card: srsCards })
    .from(vocabItems)
    .leftJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.itemKind, "vocab")))
    .where(
      and(
        eq(vocabItems.userId, userId),
        q ? or(ilike(vocabItems.lemma, `%${q}%`), ilike(vocabItems.translationBg, `%${q}%`), ilike(vocabItems.phrase, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(vocabItems.createdAt));
  const mapped = rows.map((r) => ({ ...r.item, status: r.card ? statusOf(r.card) : ("new" as const), due: r.card?.due ?? null }));
  return opts.status ? mapped.filter((r) => r.status === opts.status) : mapped;
}

export async function getWord(userId: string, id: string) {
  const [row] = await db
    .select({ item: vocabItems, card: srsCards })
    .from(vocabItems)
    .leftJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.itemKind, "vocab")))
    .where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId)))
    .limit(1);
  if (!row) return null;
  const ctx = await db.select().from(encounters).where(and(eq(encounters.vocabItemId, id), eq(encounters.userId, userId))).orderBy(desc(encounters.createdAt));
  return { ...row.item, status: row.card ? statusOf(row.card) : ("new" as const), card: row.card, encounters: ctx };
}

export async function updateWord(
  userId: string,
  id: string,
  patch: Partial<Pick<NewWord, "translationBg" | "translationAltBg" | "meaningBg" | "exampleEn" | "notes">>,
) {
  const set: Record<string, string | null> = {};
  if (patch.translationBg !== undefined) {
    const t = clean(patch.translationBg);
    if (!t) throw new Error("Преводът не може да е празен");
    set.translationBg = t;
  }
  for (const k of ["translationAltBg", "meaningBg", "exampleEn", "notes"] as const) if (patch[k] !== undefined) set[k] = orNull(patch[k]);
  if (!Object.keys(set).length) return;
  await db.update(vocabItems).set(set).where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId)));
}

export async function deleteWord(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const del = await tx.delete(vocabItems).where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId))).returning({ id: vocabItems.id });
    if (del.length) await tx.delete(srsCards).where(and(eq(srsCards.itemId, id), eq(srsCards.userId, userId), eq(srsCards.itemKind, "vocab")));
  });
}

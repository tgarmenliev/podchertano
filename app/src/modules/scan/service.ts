import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { sourceImages, sources, vocabItems, encounters } from "@/core/db/schema";
import { addWord, type NewWord } from "@/modules/vocab/service";
import type { ScanWord } from "./types";

export type SaveScanInput = {
  title?: string | null;
  image: Buffer;
  mime: string;
  width: number;
  height: number;
  words: ScanWord[];
  items: (Omit<NewWord, "sourceId"> & { surfaceForm: string })[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const months = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
export const defaultTitle = (d: Date, tz = "Europe/Sofia") => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
  return `Страница от ${parts[2]} ${months[parts[1] - 1]}`;
};

/** Записва страницата (снимка + разпознат текст) и избраните думи в една транзакция. */
export async function saveScan(userId: string, input: SaveScanInput, now = new Date()) {
  const lines = new Map<number, string[]>();
  for (const w of input.words) {
    if (!lines.has(w.line)) lines.set(w.line, []);
    lines.get(w.line)!.push(w.t);
  }
  const fullText = [...lines.values()].map((l) => l.join(" ")).join("\n");

  return db.transaction(async (tx) => {
    const [src] = await tx
      .insert(sources)
      .values({
        userId,
        kind: "reading_photo",
        title: input.title?.trim() || defaultTitle(now),
        fullText,
        words: input.words.map((w) => ({ i: w.i, t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line, para: w.para, score: w.score, auto: w.auto, sel: w.sel })),
        imageW: input.width,
        imageH: input.height,
        pipelineVersion: "browser-tesseract.v1",
      })
      .returning({ id: sources.id });
    await tx.insert(sourceImages).values({ sourceId: src.id, userId, mime: input.mime, bytes: input.image.length, data: input.image });
    let created = 0;
    for (const it of input.items) {
      const r = await addWord(userId, { ...it, sourceId: src.id }, tx);
      if (r.created) created++;
    }
    return { sourceId: src.id, created, total: input.items.length };
  });
}

export async function listSources(userId: string, limit = 50) {
  return db
    .select({
      id: sources.id,
      title: sources.title,
      createdAt: sources.createdAt,
      words: sql<number>`(select count(distinct e.vocab_item_id) from encounters e where e.source_id = "sources"."id")::int`,
    })
    .from(sources)
    .where(eq(sources.userId, userId))
    .orderBy(desc(sources.createdAt))
    .limit(limit);
}

export async function getSource(userId: string, id: string) {
  const [s] = await db.select().from(sources).where(and(eq(sources.id, id), eq(sources.userId, userId))).limit(1);
  if (!s) return null;
  const saved = await db
    .select({ id: vocabItems.id, lemma: vocabItems.lemma, phrase: vocabItems.phrase, translationBg: vocabItems.translationBg })
    .from(encounters)
    .innerJoin(vocabItems, eq(vocabItems.id, encounters.vocabItemId))
    .where(and(eq(encounters.sourceId, id), eq(encounters.userId, userId)));
  return { ...s, saved };
}

export async function getSourceImage(userId: string, id: string) {
  const [r] = await db.select({ data: sourceImages.data, mime: sourceImages.mime }).from(sourceImages).where(and(eq(sourceImages.sourceId, id), eq(sourceImages.userId, userId))).limit(1);
  return r ?? null;
}

export async function deleteSource(userId: string, id: string) {
  // думите остават в речника; изчезват само страницата, снимката (каскадно) и връзките към нея
  await db.delete(sources).where(and(eq(sources.id, id), eq(sources.userId, userId)));
}

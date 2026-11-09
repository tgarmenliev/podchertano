// Интеграционен тест на речника и преговора срещу реална (локална) база.
import { randomUUID } from "node:crypto";
import { db } from "../src/core/db";
import { profiles, srsCards, user } from "../src/core/db/schema";
import { addWord, deleteWord, getWord, listWords, updateWord } from "../src/modules/vocab/service";
import { getQueue, getStats, maskSentence, submitReview } from "../src/modules/review/service";
import { eq } from "drizzle-orm";
import { deleteSource, getSource, getSourceImage, listSources, saveScan } from "../src/modules/scan/service";

const assert = (c: boolean, m: string) => { if (!c) { console.error("ПРОВАЛ:", m); process.exit(1); } console.log("ok  ", m); };
const U = "svc_test_user", V = "svc_other_user";
await db.delete(user).where(eq(user.id, U)); await db.delete(user).where(eq(user.id, V));
for (const id of [U, V]) { await db.insert(user).values({ id, name: id, email: `${id}@t.local` }); await db.insert(profiles).values({ id, dailyNewWords: 2 }); }

const a = await addWord(U, { lemma: "Suspicious", pos: "adj", translationBg: "подозрителен", sentence: "The locals were suspicious of him.", surfaceForm: "suspicious", exampleEn: "He gave me a suspicious look." });
const b = await addWord(U, { lemma: "give", phrase: "give up", phraseKind: "phrasal_verb", pos: "verb", translationBg: "отказвам се", sentence: "He decided to give up his job.", surfaceForm: "give up" });
const c = await addWord(U, { lemma: "fence", translationBg: "ограда" });
assert(a.created && b.created && c.created, "добавени 3 думи");
const dup = await addWord(U, { lemma: "suspicious", pos: "adj", translationBg: "подозрителен", sentence: "Another suspicious sentence here.", surfaceForm: "suspicious" });
assert(!dup.created && dup.id === a.id, "дубликат не създава втора дума, а нов контекст");
assert((await getWord(U, a.id))!.encounters.length === 2, "думата има 2 контекста");
assert((await getWord(V, a.id)) === null, "друг потребител не вижда чужда дума");
assert((await listWords(U)).length === 3, "списъкът е с 3 думи");
assert((await listWords(U, { q: "ограда" })).length === 1, "търсене по превод");
assert((await listWords(U, { status: "new" })).length === 3, "всички са нови");

assert(maskSentence("The locals were suspicious of him.", "suspicious") === "The locals were ___ of him.", "маскиране на дума в изречение");
assert(maskSentence("He was unsuspicious.", "suspicious") === null, "не маскира част от друга дума");

const q1 = await getQueue(U);
assert(q1.length === 2, "дневният лимит за нови е 2 (от 3 нови)");
assert(q1.every((x) => x.intro && x.isNew), "нови карти започват със запознанство");
const stats0 = await getStats(U);
assert(stats0.counts.new === 3 && stats0.newAvailable === 2 && stats0.streak === 0, "начална статистика");

const now = new Date();
const r1 = await submitReview(U, { logId: randomUUID(), cardId: q1[0].cardId, mode: "recognize", rating: 3, correct: true, reviewedAt: now }, now);
assert(r1.applied, "преглеждането се записва");
const logId = randomUUID();
const r2 = await submitReview(U, { logId, cardId: q1[1].cardId, mode: "recognize", rating: 1, correct: false, reviewedAt: now }, now);
const r3 = await submitReview(U, { logId, cardId: q1[1].cardId, mode: "recognize", rating: 3, correct: true, reviewedAt: now }, now);
assert(r2.applied && !r3.applied, "повторно изпратен същия logId се игнорира");

const q2 = await getQueue(U, now);
assert(q2.length === 0, "новите за деня са изчерпани, а картите още не са дължими");
const later = new Date(now.getTime() + 15 * 60_000);
const q3 = await getQueue(U, later);
assert(q3.length >= 1 && q3.some((x) => !x.intro), "след 15 мин. картата, отговорена грешно, се връща (в учене)");
const st = await getStats(U, later);
assert(st.counts.learning === 2 && st.streak === 1 && st.reviewsToday === 2, "статистика след преглед: 2 в учене, серия 1, 2 днес");
assert(st.days.length === 14 && st.days[13].n === 2, "последните 14 дни");

await updateWord(U, a.id, { translationBg: "съмнителен" });
assert((await getWord(U, a.id))!.translationBg === "съмнителен", "редакция на превод");
await deleteWord(U, b.id);
assert((await listWords(U)).length === 2, "изтриване на дума");
assert((await db.select().from(srsCards).where(eq(srsCards.itemId, b.id))).length === 0, "изтрива се и картата");
let threw = false; try { await submitReview(V, { logId: randomUUID(), cardId: q1[0].cardId, mode: "recognize", rating: 3, correct: true, reviewedAt: now }); } catch { threw = true; }
assert(threw, "чужд потребител не може да прегледа чужда карта");


// ── страници със снимки ──
const words = [
  { i: 0, t: "He", x: 0, y: 0, w: 10, h: 10, line: 0, para: 0, conf: 90, score: 0, auto: false, sel: false },
  { i: 1, t: "repaired", x: 10, y: 0, w: 10, h: 10, line: 0, para: 0, conf: 90, score: 0.9, auto: true, sel: true },
  { i: 2, t: "the", x: 20, y: 0, w: 10, h: 10, line: 0, para: 0, conf: 90, score: 0, auto: false, sel: false },
  { i: 3, t: "fence.", x: 30, y: 0, w: 10, h: 10, line: 1, para: 0, conf: 90, score: 0.8, auto: true, sel: true },
];
const img = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const sv = await saveScan(U, { image: img, mime: "image/jpeg", width: 1400, height: 1900, words, items: [
  { lemma: "repair", pos: "verb", translationBg: "поправям", sentence: "He repaired the fence.", surfaceForm: "repaired" },
  { lemma: "fence", pos: "noun", translationBg: "ограда", sentence: "He repaired the fence.", surfaceForm: "fence" },
] });
assert(sv.created === 1, "страница: нова е само „repair“ („fence“ вече е в речника)");
const ls = await listSources(U);
assert(ls.length === 1 && ls[0].words === 2, "списък на страниците: 2 думи от страницата");
const gs = await getSource(U, sv.sourceId);
assert(!!gs && gs.saved.length === 2 && gs.fullText === "He repaired the\nfence.", "детайл на страница: думи и текст по редове");
assert(((await getSourceImage(U, sv.sourceId))?.data.length ?? 0) === img.length, "снимката се чете обратно");
assert((await getSource(V, sv.sourceId)) === null && (await getSourceImage(V, sv.sourceId)) === null, "чужд потребител не вижда страницата и снимката");
await deleteSource(V, sv.sourceId);
assert((await listSources(U)).length === 1, "чужд потребител не може да изтрие страница");
await deleteSource(U, sv.sourceId);
assert((await listSources(U)).length === 0 && (await getSourceImage(U, sv.sourceId)) === null, "изтриване на страница маха и снимката");
assert((await listWords(U, { q: "repair" })).length === 1, "думите остават в речника след изтриване на страницата");
await db.delete(user).where(eq(user.id, U)); await db.delete(user).where(eq(user.id, V));
console.log("ВСИЧКО МИНА (тестовите данни са изтрити)");
process.exit(0);

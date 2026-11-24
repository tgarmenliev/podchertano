// Интеграционен тест на „Твоят текст“ срещу реалната (тестова) база, с фалшив AI сървър в същия процес.
import http from "node:http";
import { eq, sql } from "drizzle-orm";
import { fakeReading } from "./mock-reading.mjs";

let mode: "ok" | "garbage" = "ok";
let calls = 0;
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    calls++;
    const content = JSON.parse(b).messages[0].content as string;
    res.setHeader("Content-Type", "application/json");
    const out = mode === "ok" ? fakeReading(content) : { nope: 1 };
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 900, completion_tokens: 1500 } }));
  });
});
await new Promise<void>((r) => server.listen(4012, r));
process.env.AI_ENABLED = "1";
process.env.OPENAI_API_KEY = "fake";
process.env.OPENAI_BASE_URL = "http://localhost:4012";

const { db } = await import("../src/core/db");
const { profiles, readings, reviewLogs, srsCards, usageEvents, user } = await import("../src/core/db/schema");
const { addWord } = await import("../src/modules/vocab/service");
const { completeReading, ensureReading, getReading, readingStatus, reportQuestion, ReadingError } = await import("../src/modules/reading/service");

const assert = (c: boolean, m: string) => { if (!c) { console.error("ПРОВАЛ:", m); process.exit(1); } console.log("ok  ", m); };
const U = "rd_test_user", V = "rd_other_user", W = "rd_few_user";
for (const id of [U, V, W]) await db.delete(user).where(eq(user.id, id));
for (const id of [U, V, W]) { await db.insert(user).values({ id, name: id, email: `${id}@t.local` }); await db.insert(profiles).values({ id }); }

const list: [string, string, string][] = [["obtain", "verb", "получавам"], ["harbour", "noun", "пристанище"], ["groom", "noun", "коняр"], ["amiable", "adj", "дружелюбен"], ["fend off", "phrasal verb", "отблъсквам"], ["preserve", "verb", "запазвам"], ["cruel", "adj", "жесток"], ["folk", "noun", "народ"], ["pipe", "noun", "лула"], ["bearing", "noun", "отношение"], ["gaunt, stringy", "adj", "кокалест"], ["be", "verb", "съм"]];
for (const [l, pos, tr] of list) await addWord(U, { lemma: l, pos, translationBg: tr, sentence: l.length > 3 ? `He said ${l} twice.` : null, surfaceForm: l });
await addWord(W, { lemma: "obtain", pos: "verb", translationBg: "получавам" });

let st = await readingStatus(U);
assert(st.enabled && st.canMake === true && st.unread === null, "статус: има достатъчно думи, още няма текст");
st = await readingStatus(W);
assert(st.enabled && st.canMake === false && st.notEnoughWords === true, "статус: с 1 дума не се прави текст");
let threw: unknown = null; try { await ensureReading(W); } catch (e) { threw = e; }
assert(threw instanceof ReadingError && threw.code === "no_words" && calls === 0, "с малко думи няма заявка към AI");

const [a, b] = await Promise.all([ensureReading(U), ensureReading(U)]);
assert(a.id === b.id, "две едновременни заявки дават един текст");
const again = await ensureReading(U);
assert(again.id === a.id && again.created === false, "непрочетеният текст се връща, не се прави нов");
const rows = await db.select().from(readings).where(eq(readings.userId, U));
assert(rows.length === 1, "в базата е записан точно един текст");

const r = (await getReading(U, a.id))!;
const words = r.words as { itemId: string; target: string; form: string }[];
assert(words.length >= 8 && !words.some((w) => w.target === "be" || w.target.includes(",")), "боклукът и лесните думи не са в текста");
assert(words.every((w) => r.body.toLowerCase().includes(w.form.toLowerCase())), "всяка дума е в текста");
assert((r.questions as unknown[]).length === 5, "5 въпроса");
assert(await getReading(V, a.id) === null, "чужд потребител не вижда текста");
const ev = await db.select().from(usageEvents).where(eq(usageEvents.userId, U));
assert(ev.filter((x) => x.kind === "reading" && x.ok).length === 1 && calls >= 1, "разходът е записан");

await reportQuestion(U, a.id, 2); await reportQuestion(U, a.id, 2); await reportQuestion(U, a.id, 99);
assert(JSON.stringify((await getReading(U, a.id))!.reported) === "[2]", "докладван въпрос се записва веднъж, невалиден индекс се игнорира");

// край: отговори и докоснати думи
const peeked = [words[0].itemId, words[1].itemId, "00000000-0000-0000-0000-000000000000"];
const done = await completeReading(U, a.id, { answers: [1, 1, 0, 1, 9], peeked, durationMs: 120000 });
assert(done.score === 3 && done.total === 5, "резултат 3 от 5 (грешен и невалиден отговор не се броят)");
assert(done.peeked.length === 2 && done.recognized === words.length - 2, "докоснатите думи са 2, непознатият id се игнорира");
let logs = await db.select().from(reviewLogs).where(eq(reviewLogs.userId, U));
assert(logs.length === words.length && logs.every((l) => l.mode === "reading"), "всяка дума от текста получава преглед (режим „четене“)");
const ids = new Set([words[0].itemId, words[1].itemId]);
const cards = await db.select().from(srsCards).where(eq(srsCards.userId, U));
const byItem = new Map(cards.map((c) => [c.itemId, c]));
const logOf = (itemId: string) => logs.find((l) => l.cardId === byItem.get(itemId)!.id)!;
assert(logOf(words[0].itemId).rating === 1 && !logOf(words[0].itemId).correct, "докоснатата дума: „не я помня“");
assert(words.slice(2).every((w) => logOf(w.itemId).rating === 2 && logOf(w.itemId).correct), "недокоснатите нови думи: „трудно“, отчетени като познати");
assert(words.every((w) => byItem.get(w.itemId)!.state !== 0), "картите са влезли в график");
void ids;

const done2 = await completeReading(U, a.id, { answers: [0, 0, 0, 0, 0], peeked: [], durationMs: 1 });
assert(done2.alreadyDone && done2.score === 3, "повторно изпращане връща първия резултат");
logs = await db.select().from(reviewLogs).where(eq(reviewLogs.userId, U));
assert(logs.length === words.length, "повторно изпращане не прави втори преглед");

st = await readingStatus(U);
assert(st.enabled && st.unread === null && st.completed === 1, "статус след край: няма непрочетен, 1 завършен");

// лош отговор на AI: грешка, без запис на текст, но с отчетен разход
mode = "garbage";
const before = calls;
threw = null; try { await ensureReading(U); } catch (e) { threw = e; }
assert(threw instanceof ReadingError && threw.code === "failed" && calls - before === 2, "лош отговор: две опитки, после грешка");
assert((await db.select().from(readings).where(eq(readings.userId, U))).length === 1, "лошият отговор не записва текст");
const ev2 = await db.select().from(usageEvents).where(eq(usageEvents.userId, U));
assert(ev2.some((x) => x.kind === "reading" && !x.ok), "неуспехът е отчетен в разходите");
mode = "ok";

// дневен лимит (3 заявки за 24 ч.)
await db.execute(sql`delete from usage_events where user_id = ${U}`);
for (let i = 0; i < 3; i++) await db.insert(usageEvents).values({ userId: U, kind: "reading", provider: "openai", estCostMicroEur: 1, ok: true });
threw = null; try { await ensureReading(U); } catch (e) { threw = e; }
assert(threw instanceof ReadingError && threw.code === "limit", "дневният лимит спира нови текстове");

for (const id of [U, V, W]) await db.delete(user).where(eq(user.id, id));
server.close();
console.log("ВСИЧКО МИНА (тестовите данни са изтрити)");
process.exit(0);

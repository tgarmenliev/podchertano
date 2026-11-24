import { z } from "zod";
import { aiEnabled, aiLimits, estimateMicroEur } from "./config";
import { findForm } from "./findform";

/*
  „Твоят текст“: AI пише кратък текст във формата на задача от ДЗИ с думите на ученика и 5 въпроса с избор.
  Всичко, което моделът върне, се проверява (validateReading). Ако нещо не е наред, пробваме още веднъж; после грешка.
*/
export const READING_PROMPT_VERSION = "reading.v1";

export type GlossaryItem = { id: number; target: string; pos: string; bg: string; seen?: string | null };

export function buildReadingPrompt(items: GlossaryItem[]) {
  return `You write practice reading tasks for a Bulgarian 12th-grade student preparing for the Bulgarian state matriculation exam (ДЗИ) in English. Level: B1 to B2.

Write ONE original text of 230 to 290 words in 3 or 4 paragraphs, in the style of exam reading passages: a short story, a magazine report, a blog post or an interview about an ordinary, interesting situation. The topic must NOT be about the target words themselves.
The student is learning the TARGET WORDS below. Use EVERY target word or phrase naturally at least once, in the sense given by its Bulgarian meaning, in the exact form or an inflected form (tense, plural, -ing). Never define them in the text. Keep all other vocabulary at B1 level or easier, so that the target words are the main difficulty. Give the text a title of 2 to 7 words. No markdown, no bold, no brackets.

Then write exactly 5 multiple-choice questions in the style of the exam (for example "What does the writer say about ...?", "Why did ...?", "What is meant by '...' in the text?"). Each question has exactly 4 options and exactly one correct answer that is clearly supported by the text. The wrong options must sound plausible but be clearly wrong according to the text. Vary the position of the correct answer. For each question give:
- "evidence": ONE sentence copied EXACTLY, character for character, from your text, which proves the correct answer;
- "why_bg": one short sentence in Bulgarian that explains why the answer is correct.

Return JSON only:
{"title": "...", "paragraphs": ["...", "..."], "used": [{"id": 0, "form": "exact words as they appear in the text"}], "questions": [{"q": "...", "options": ["...", "...", "...", "..."], "answer": 0, "evidence": "...", "why_bg": "..."}]}
"used" must list every target word with its "id" and the exact "form" you wrote (copy it from your text).

TARGET WORDS (the "seen" sentence only shows the sense; do not copy it):
${JSON.stringify(items)}`;
}

const rawSchema = z.object({
  title: z.string().trim().min(1).max(80),
  paragraphs: z.array(z.string().trim().min(1).max(1400)).min(2).max(6),
  used: z.array(z.object({ id: z.number().int(), form: z.string().trim().min(1).max(80) })).max(20),
  questions: z
    .array(
      z.object({
        q: z.string().trim().min(5).max(240),
        options: z.array(z.string().trim().min(1).max(220)).length(4),
        answer: z.number().int().min(0).max(3),
        evidence: z.string().trim().min(5).max(500),
        why_bg: z.string().trim().min(3).max(320),
      }),
    )
    .min(3)
    .max(8),
});

export type ReadingQuestion = { q: string; options: string[]; answer: number; evidence: string; whyBg: string };
export type Reading = { title: string; paragraphs: string[]; used: { id: number; form: string }[]; questions: ReadingQuestion[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
export { findForm };

export type Validated = { ok: true; reading: Reading; missing: number[] } | { ok: false; reason: string };

/**
 * Проверява отговора на модела. Не вярваме на нищо: думите трябва да са в текста, цитатът трябва да е в текста,
 * вариантите да са различни. Лош въпрос се маха; ако останат по-малко от 4, или липсват много думи, е грешка.
 */
export function validateReading(raw: unknown, wanted: number[]): Validated {
  const p = rawSchema.safeParse(raw);
  if (!p.success) return { ok: false, reason: "схемата не съвпада" };
  const d = p.data;
  const body = d.paragraphs.join("\n\n");
  if (/[\[\]{}*#_<>]/.test(body)) return { ok: false, reason: "текстът съдържа форматиране" };
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 150 || words > 380) return { ok: false, reason: `дължина ${words} думи` };

  const ids = new Set(wanted);
  const used: { id: number; form: string }[] = [];
  for (const u of d.used) {
    if (!ids.has(u.id) || used.some((x) => x.id === u.id)) continue;
    if (findForm(body, u.form)) used.push(u);
  }
  const missing = wanted.filter((id) => !used.some((u) => u.id === id));
  // допускаме да липсват най-много 2 думи (и не повече от трета част)
  if (used.length < Math.min(4, wanted.length) || missing.length > Math.max(2, Math.floor(wanted.length / 3))) return { ok: false, reason: `използвани ${used.length} от ${wanted.length}` };

  const nb = norm(body);
  const questions: ReadingQuestion[] = [];
  for (const q of d.questions) {
    const opts = q.options.map(norm);
    if (new Set(opts).size !== 4) continue;
    if (!nb.includes(norm(q.evidence))) continue;
    questions.push({ q: q.q, options: q.options, answer: q.answer, evidence: q.evidence, whyBg: q.why_bg });
  }
  if (questions.length < 4) return { ok: false, reason: `годни въпроси: ${questions.length}` };
  return { ok: true, reading: { title: d.title, paragraphs: d.paragraphs, used, questions: questions.slice(0, 5) }, missing };
}

export type ReadingResult = { reading: Reading; missing: number[]; model: string; tokensIn: number; tokensOut: number; estCostMicroEur: number; attempts: number };
type Deps = { fetch?: typeof fetch; apiKey?: string; model?: string };

export async function generateReading(items: GlossaryItem[], deps: Deps = {}): Promise<ReadingResult> {
  if (!aiEnabled() && !deps.apiKey) throw new Error("AI е изключен");
  if (items.length < 4 || items.length > 14) throw new Error("Неподходящ брой думи");
  const model = deps.model ?? aiLimits().model;
  let tokensIn = 0;
  let tokensOut = 0;
  let lastReason = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await (deps.fetch ?? fetch)(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com"}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.apiKey ?? process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: buildReadingPrompt(items) }], response_format: { type: "json_object" }, reasoning_effort: "low" }),
    });
    const j = (await res.json()) as { error?: { message: string }; choices?: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    tokensIn += j.usage?.prompt_tokens ?? 0;
    tokensOut += j.usage?.completion_tokens ?? 0;
    if (!res.ok || j.error) throw new Error("Услугата не отговори. Опитай пак след малко.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(j.choices?.[0]?.message.content ?? "");
    } catch {
      lastReason = "неясен отговор";
      continue;
    }
    const v = validateReading(parsed, items.map((i) => i.id));
    if (v.ok) return { reading: v.reading, missing: v.missing, model, tokensIn, tokensOut, estCostMicroEur: estimateMicroEur(model, tokensIn, tokensOut), attempts: attempt };
    lastReason = v.reason;
  }
  const err = new Error("Не успях да направя добър текст този път. Опитай пак след малко.") as Error & { reason?: string; costMicroEur?: number; tokensIn?: number; tokensOut?: number };
  err.reason = lastReason;
  err.tokensIn = tokensIn;
  err.tokensOut = tokensOut;
  err.costMicroEur = estimateMicroEur(model, tokensIn, tokensOut);
  throw err;
}

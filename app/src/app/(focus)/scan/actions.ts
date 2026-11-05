"use server";

import { z } from "zod";
import { aiEnabled } from "@/core/ai/config";
import { BudgetError } from "@/core/ai/budget";
import { enrichWords, type Enriched } from "@/core/ai/enrich";
import { checkBudget, recordUsage } from "@/core/ai/usage";
import { requireActive } from "@/core/auth/session";
import { saveScan } from "@/modules/scan/service";

export async function aiAvailable() {
  await requireActive();
  return aiEnabled();
}

const itemIn = z.object({ id: z.number().int().min(0).max(1000), surface: z.string().trim().min(1).max(80), sentence: z.string().trim().max(400) });

export type EnrichOut = { ok: true; items: Enriched[] } | { ok: false; error: string };

/** Автоматично попълване. Изключено по подразбиране; има дневен лимит и месечен прекъсвач. */
export async function enrichAction(raw: unknown): Promise<EnrichOut> {
  const { user } = await requireActive();
  if (!aiEnabled()) return { ok: false, error: "Автоматичното попълване не е включено. Попълни думите ръчно." };
  const parsed = z.array(itemIn).min(1).max(40).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Невалидни данни." };
  try {
    await checkBudget(user.id);
    const r = await enrichWords({ items: parsed.data });
    await recordUsage({ userId: user.id, kind: "enrich", provider: "openai", model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, estCostMicroEur: r.estCostMicroEur, ok: true });
    return { ok: true, items: r.items };
  } catch (e) {
    if (e instanceof BudgetError) return { ok: false, error: e.message };
    await recordUsage({ userId: user.id, kind: "enrich", provider: "openai", model: "", tokensIn: 0, tokensOut: 0, estCostMicroEur: 0, ok: false }).catch(() => {});
    return { ok: false, error: e instanceof Error ? e.message : "Нещо се обърка." };
  }
}

const scanWord = z.object({
  i: z.number().int().min(0), t: z.string().max(80), x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  line: z.number().int(), para: z.number().int(), conf: z.number(), score: z.number(), auto: z.boolean(), sel: z.boolean(),
});
const saveItem = z.object({
  lemma: z.string().trim().min(1).max(60),
  surfaceForm: z.string().trim().min(1).max(80),
  sentence: z.string().trim().max(400).nullable(),
  translationBg: z.string().trim().min(1).max(120),
  translationAltBg: z.string().trim().max(120).nullable().optional(),
  meaningBg: z.string().trim().max(220).nullable().optional(),
  exampleEn: z.string().trim().max(220).nullable().optional(),
  pos: z.string().max(20).optional(),
  phrase: z.string().trim().max(60).nullable().optional(),
  phraseKind: z.enum(["phrasal_verb", "idiom", "collocation"]).nullable().optional(),
});
const saveSchema = z.object({ width: z.number().int().min(100).max(6000), height: z.number().int().min(100).max(6000), words: z.array(scanWord).max(2500), items: z.array(saveItem).min(1).max(60), title: z.string().trim().max(80).nullable().optional() });

export type SaveOut = { ok: true; sourceId: string; created: number } | { ok: false; error: string };

export async function saveScanAction(fd: FormData): Promise<SaveOut> {
  const { user } = await requireActive();
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_500_000 || file.type !== "image/jpeg") return { ok: false, error: "Снимката не е във вид, който приемаме." };
  let payload;
  try {
    payload = saveSchema.parse(JSON.parse(String(fd.get("data") ?? "")));
  } catch {
    return { ok: false, error: "Невалидни данни." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // JPEG започва с FF D8 FF: проверяваме съдържанието, не само заявеното
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return { ok: false, error: "Снимката не е във вид, който приемаме." };
  const r = await saveScan(user.id, {
    title: payload.title,
    image: bytes,
    mime: "image/jpeg",
    width: payload.width,
    height: payload.height,
    words: payload.words,
    items: payload.items.map((it) => ({
      lemma: it.lemma, phrase: it.phrase ?? null, phraseKind: it.phraseKind ?? null, pos: it.pos ?? "", translationBg: it.translationBg,
      translationAltBg: it.translationAltBg ?? null, meaningBg: it.meaningBg ?? null, exampleEn: it.exampleEn ?? null,
      sentence: it.sentence, surfaceForm: it.surfaceForm,
    })),
  });
  return { ok: true, sourceId: r.sourceId, created: r.created };
}

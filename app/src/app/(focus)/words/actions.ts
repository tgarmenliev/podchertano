"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { addWord, deleteWord, updateWord } from "@/modules/vocab/service";

export type FormState = { error?: string };

const txt = (max: number) => z.string().trim().max(max);
const addSchema = z.object({
  text: txt(60).min(1, "Напиши думата или израза."),
  translation: txt(120).min(1, "Напиши превода."),
  pos: z.enum(["noun", "verb", "adj", "adv", "phrasal verb", "idiom", "other", ""]).default(""),
  meaning: txt(200).optional(),
  sentence: txt(300).optional(),
  surface: txt(60).optional(),
});

export async function addWordAction(_: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireActive();
  const parsed = addSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Провери данните." };
  const d = parsed.data;
  const multi = /\s/.test(d.text);
  const kind = d.pos === "phrasal verb" ? "phrasal_verb" : d.pos === "idiom" ? "idiom" : multi ? "collocation" : null;
  if (d.sentence && d.surface && !d.sentence.toLowerCase().includes(d.surface.toLowerCase())) {
    return { error: "Формата в изречението трябва да се среща в самото изречение." };
  }
  await addWord(user.id, {
    lemma: d.text,
    phrase: multi ? d.text : null,
    phraseKind: kind,
    pos: d.pos === "other" ? "" : d.pos,
    translationBg: d.translation,
    meaningBg: d.meaning || null,
    sentence: d.sentence || null,
    surfaceForm: d.surface || d.text,
  });
  revalidatePath("/words");
  redirect("/words");
}

const editSchema = z.object({
  id: z.uuid(),
  translation: txt(120).min(1, "Преводът не може да е празен."),
  alt: txt(120).optional(),
  meaning: txt(200).optional(),
  example: txt(300).optional(),
  notes: txt(300).optional(),
});

export async function updateWordAction(_: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireActive();
  const parsed = editSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Провери данните." };
  const d = parsed.data;
  await updateWord(user.id, d.id, { translationBg: d.translation, translationAltBg: d.alt, meaningBg: d.meaning, exampleEn: d.example, notes: d.notes });
  revalidatePath(`/words/${d.id}`);
  revalidatePath("/words");
  redirect(`/words/${d.id}`);
}

export async function deleteWordAction(fd: FormData) {
  const { user } = await requireActive();
  const id = z.uuid().parse(fd.get("id"));
  await deleteWord(user.id, id);
  revalidatePath("/words");
  redirect("/words");
}

const aiWordSchema = z.object({
  lemma: txt(60).min(1),
  translation: txt(120).min(1, "Напиши превода."),
  alt: txt(120).nullable().optional(),
  meaning: txt(220).nullable().optional(),
  example: txt(220).nullable().optional(),
  pos: z.string().max(20).optional(),
  phrase: txt(60).nullable().optional(),
  sentence: txt(300).nullable().optional(),
  surface: txt(60).nullable().optional(),
});

export type SaveWordOut = { ok: true; id: string; created: boolean } | { ok: false; error: string };

/** Записва дума, попълнена от AI (и редактирана от ученика). Не пренасочва: може да се добавя дума след дума. */
export async function saveWordAction(raw: unknown): Promise<SaveWordOut> {
  const { user } = await requireActive();
  const parsed = aiWordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Провери данните." };
  const d = parsed.data;
  const pos = d.pos && d.pos !== "other" ? d.pos : "";
  const target = (d.phrase || d.lemma).toLowerCase();
  // без изречение на ученика ползваме примера на AI като контекст, ако съдържа думата (за „допълни думата“ в преговора)
  const mine = d.sentence?.trim() || null;
  const ex = d.example?.trim() || null;
  const sentence = mine ?? (ex && ex.toLowerCase().includes(target) ? ex : null);
  const surface = mine ? d.surface?.trim() || target : sentence ? target : null;
  if (mine && surface && !mine.toLowerCase().includes(surface.toLowerCase())) return { ok: false, error: "Думата трябва да се среща в изречението." };
  const r = await addWord(user.id, {
    lemma: d.lemma,
    phrase: d.phrase || null,
    phraseKind: pos === "phrasal verb" ? "phrasal_verb" : pos === "idiom" ? "idiom" : d.phrase ? "collocation" : null,
    pos,
    translationBg: d.translation,
    translationAltBg: d.alt || null,
    meaningBg: d.meaning || null,
    exampleEn: ex,
    sentence,
    surfaceForm: surface,
  });
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true, id: r.id, created: r.created };
}

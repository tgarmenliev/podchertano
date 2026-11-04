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

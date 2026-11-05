"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { addFromPage, deleteSource } from "@/modules/scan/service";

export async function deleteSourceAction(fd: FormData) {
  const { user } = await requireActive();
  await deleteSource(user.id, z.uuid().parse(fd.get("id")));
  revalidatePath("/pages");
  redirect("/pages");
}

const addSchema = z.object({
  sourceId: z.uuid(),
  wordIds: z.array(z.number().int().min(0)).min(1).max(8),
  surface: z.string().trim().min(1).max(80),
  sentence: z.string().trim().max(400),
  lemma: z.string().trim().min(1).max(60),
  translationBg: z.string().trim().min(1).max(120),
  translationAltBg: z.string().trim().max(120).nullable().optional(),
  meaningBg: z.string().trim().max(220).nullable().optional(),
  exampleEn: z.string().trim().max(220).nullable().optional(),
  pos: z.string().max(20).optional(),
  phrase: z.string().trim().max(60).nullable().optional(),
});

export type AddOut = { ok: true; created: boolean } | { ok: false; error: string };

/** „Добави в речника“ за дума, докосната в текста на запазена страница. */
export async function addFromPageAction(raw: unknown): Promise<AddOut> {
  const { user } = await requireActive();
  const p = addSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Невалидни данни." };
  const d = p.data;
  const multi = d.wordIds.length > 1;
  try {
    const r = await addFromPage(
      user.id,
      d.sourceId,
      {
        lemma: d.lemma,
        phrase: d.phrase ?? (multi ? d.surface.toLowerCase() : null),
        phraseKind: d.pos === "phrasal verb" ? "phrasal_verb" : d.pos === "idiom" ? "idiom" : d.phrase || multi ? "collocation" : null,
        pos: d.pos ?? "",
        translationBg: d.translationBg,
        translationAltBg: d.translationAltBg ?? null,
        meaningBg: d.meaningBg ?? null,
        exampleEn: d.exampleEn ?? null,
        sentence: d.sentence || null,
        surfaceForm: d.surface,
      },
      d.wordIds,
    );
    revalidatePath(`/pages/${d.sourceId}`);
    revalidatePath("/words");
    return { ok: true, created: r.created };
  } catch {
    return { ok: false, error: "Не успях да запазя думата. Опитай пак." };
  }
}

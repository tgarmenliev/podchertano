import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { db } from "@/core/db";
import { encounters, vocabItems } from "@/core/db/schema";
import { IconBack } from "@/design/icons";
import { getSource } from "@/modules/scan/service";
import { PrintButton } from "./print-button";

export const metadata = { title: "Лист за преписване" };

/*
  Лист за преписване: думите от страницата в таблица, едър шрифт, за препис в тетрадка.
  Пази метода на ученика (писането на ръка помага за запомнянето).
*/
export default async function Sheet({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireActive();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = await getSource(user.id, id);
  if (!s) notFound();
  const rows = await db
    .select({ id: vocabItems.id, lemma: vocabItems.lemma, phrase: vocabItems.phrase, tr: vocabItems.translationBg, alt: vocabItems.translationAltBg, meaning: vocabItems.meaningBg, sentence: encounters.sentence })
    .from(encounters)
    .innerJoin(vocabItems, eq(vocabItems.id, encounters.vocabItemId))
    .where(and(eq(encounters.sourceId, id), eq(encounters.userId, user.id)))
    .orderBy(vocabItems.lemma);

  return (
    <div className="mx-auto min-h-dvh max-w-2xl">
      <header className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href={`/pages/${id}`} aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="flex-1 truncate text-[17px] font-semibold">Лист за преписване</h1>
        <PrintButton />
      </header>
      <main className="px-5 pb-16 pt-5">
        <p className="no-print mb-5 max-w-[44ch] text-[15px] text-ink-2">Препиши думите в тетрадката си: писането на ръка помага да ги запомниш. После ги преговаряш тук.</p>
        <h2 className="mb-3 hidden text-lg font-semibold print:block">{s.title}</h2>
        {rows.length === 0 ? (
          <p className="text-ink-2">От тази страница няма запазени думи.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-ink text-sm text-ink-2">
                <th className="py-2 pr-4 font-medium">Английски</th>
                <th className="py-2 font-medium">Български</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id + r.sentence} className="border-b border-line align-top">
                  <td className="read py-3 pr-4 text-[22px] font-medium leading-snug">{r.phrase ?? r.lemma}</td>
                  <td className="py-3 text-[19px] leading-snug">
                    {r.tr}
                    {r.alt && <span className="text-ink-2">, {r.alt}</span>}
                    {r.meaning && <span className="mt-1 block text-[14px] text-ink-2">{r.meaning}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

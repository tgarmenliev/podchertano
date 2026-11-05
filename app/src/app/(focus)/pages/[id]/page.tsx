import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { IconBack } from "@/design/icons";
import { aiEnabled } from "@/core/ai/config";
import { getSource } from "@/modules/scan/service";
import { listWords } from "@/modules/vocab/service";
import { deleteSourceAction } from "../actions";
import { DeletePage } from "./delete-page";
import { Viewer } from "./viewer";

export const metadata = { title: "Страница" };

type W = { i: number; t: string; x: number; y: number; w: number; h: number; line: number; para: number; sel: boolean };

export default async function PageDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { user } = await requireActive();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [s, all] = await Promise.all([getSource(user.id, id), listWords(user.id)]);
  if (!s) notFound();
  const words = (s.words as W[] | null) ?? [];

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/pages" aria-label="Назад към страниците" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{s.title}</h1>
      </header>
      <main className="space-y-8 px-5 pb-16 pt-5">
        {isNew && (
          <p role="status" className="rounded-[var(--radius-m)] px-4 py-3 text-[15px]" style={{ background: "var(--ok-tint)", color: "var(--ok)" }}>
            Страницата е запазена. {Number(isNew) > 0 ? `Нови думи в речника: ${isNew}.` : "Всички думи вече бяха в речника."}
          </p>
        )}
        {isNew && (
          <div className="enter flex flex-col gap-2">
            <Link href="/" className="btn btn-primary w-full">Към началото</Link>
            {s.saved.length > 0 && <Link href={`/pages/${s.id}/sheet`} className="btn btn-secondary w-full">Лист за преписване</Link>}
          </div>
        )}

        <section aria-labelledby="saved">
          <h2 id="saved" className="text-base font-semibold">Думи от тази страница</h2>
          {s.saved.length ? (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {s.saved.map((w) => (
                <li key={w.id}>
                  <Link href={`/words/${w.id}`} className="flex items-baseline justify-between gap-4 py-3 active:bg-surface">
                    <span className="read text-[18px] font-medium">{w.phrase ?? w.lemma}</span>
                    <span className="truncate text-[15px] text-ink-2">{w.translationBg}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-2">Няма запазени думи от тази страница.</p>
          )}
          {s.saved.length > 0 && (
            <Link href={`/pages/${s.id}/sheet`} className="btn btn-secondary mt-4 w-full">
              Лист за преписване
            </Link>
          )}
        </section>

        <Viewer id={s.id} words={words} width={s.imageW ?? 1} height={s.imageH ?? 1} saved={all.map((w) => ({ id: w.id, key: (w.phrase ?? w.lemma).toLowerCase() }))} aiAvailable={aiEnabled()} />

        <section className="border-t border-line pt-6">
          <form action={deleteSourceAction}>
            <input type="hidden" name="id" value={s.id} />
            <DeletePage />
          </form>
          <p className="mt-2 text-sm text-ink-2">Думите остават в речника, изчезват само страницата и снимката.</p>
        </section>
      </main>
    </div>
  );
}

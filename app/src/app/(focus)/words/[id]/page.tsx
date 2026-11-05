import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { IconBack } from "@/design/icons";
import { SpeakButton } from "@/design/speak";
import { StatusMark } from "@/design/status-mark";
import { posLabel } from "@/modules/vocab/pos";
import { getWord } from "@/modules/vocab/service";
import { deleteWordAction } from "../actions";
import { EditForm } from "./edit-form";
import { DeleteButton } from "./delete-button";

export const metadata = { title: "Дума" };

const fmt = new Intl.DateTimeFormat("bg-BG", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlight({ sentence, surface }: { sentence: string; surface: string }) {
  const m = new RegExp(`(?<![A-Za-z'])(${esc(surface)})(?![A-Za-z'])`, "i").exec(sentence);
  if (!m) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, m.index)}
      <span className="mark px-0.5" data-on="true">{m[0]}</span>
      {sentence.slice(m.index + m[0].length)}
    </>
  );
}

export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireActive();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const w = await getWord(user.id, id);
  if (!w) notFound();

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/words" aria-label="Назад към речника" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="sr-only">{w.phrase ?? w.lemma}</h1>
      </header>

      <main className="space-y-8 px-5 pb-16 pt-6">
        <section>
          <div className="flex items-start justify-between gap-3">
            <p className="read text-[36px] font-medium leading-tight">{w.phrase ?? w.lemma}</p>
            <SpeakButton text={w.phrase ?? w.lemma} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {w.pos && <span className="text-sm text-ink-2">{posLabel(w.pos)}</span>}
            <StatusMark status={w.status as "new" | "learning" | "known"} />
          </p>
          <p className="mt-5 text-2xl font-medium">{w.translationBg}</p>
          {w.translationAltBg && <p className="mt-1 text-ink-2">{w.translationAltBg}</p>}
          {w.meaningBg && <p className="mt-3 text-ink-2">{w.meaningBg}</p>}
          {w.exampleEn && <p className="read mt-3 text-[17px] italic text-ink-2">{w.exampleEn}</p>}
          {w.card && w.status !== "new" && <p className="mt-5 text-sm text-ink-2">Следващ преговор: {fmt.format(w.card.due)}</p>}
          {w.status === "new" && <p className="mt-5 text-sm text-ink-2">Още не е преговаряна.</p>}
        </section>

        <section className="border-t border-line pt-6" aria-labelledby="ctx">
          <h2 id="ctx" className="text-base font-semibold">Къде си я срещнал</h2>
          {w.encounters.length ? (
            <ul className="mt-3 space-y-4">
              {w.encounters.map((e) => (
                <li key={e.id} className="read text-[18px] leading-[1.7]">
                  <Highlight sentence={e.sentence} surface={e.surfaceForm} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-2">Няма запазено изречение.</p>
          )}
        </section>

        <section className="border-t border-line pt-6">
          <details>
            <summary className="cursor-pointer text-base font-semibold">Редактирай</summary>
            <div className="mt-4">
              <EditForm word={{ id: w.id, translationBg: w.translationBg, translationAltBg: w.translationAltBg ?? "", meaningBg: w.meaningBg ?? "", exampleEn: w.exampleEn ?? "", notes: w.notes ?? "" }} />
            </div>
          </details>
        </section>

        <section className="border-t border-line pt-6">
          <form action={deleteWordAction}>
            <input type="hidden" name="id" value={w.id} />
            <DeleteButton />
          </form>
        </section>
      </main>
    </div>
  );
}

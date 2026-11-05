import Link from "next/link";
import { requireActive } from "@/core/auth/session";
import { IconSettings } from "@/design/icons";
import Image from "next/image";
import { IconCamera, IconChevron } from "@/design/icons";
import { getStats } from "@/modules/review/service";
import { listSources } from "@/modules/scan/service";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default async function Today() {
  const { user } = await requireActive();
  const [s, recent] = await Promise.all([getStats(user.id), listSources(user.id, 3)]);
  const todo = Math.min(s.dueNow + s.newAvailable, 25);
  const minutes = Math.max(1, Math.round(todo * 0.4));
  const hasWords = s.total > 0;

  return (
    <main>
      <header className="flex items-center justify-between py-2">
        <span className="relative text-[19px] font-semibold tracking-tight">
          Подчертано
          <span className="wave-line absolute inset-x-0 -bottom-[7px]" style={{ height: 5 }} />
        </span>
        <div className="flex items-center gap-1">
          {s.streak > 0 && (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink tabular-nums">{s.streak}</span> {plural(s.streak, "ден", "дни")} подред
            </p>
          )}
          <Link href="/settings" aria-label="Настройки" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
            <IconSettings width={22} height={22} />
          </Link>
        </div>
      </header>

      {!hasWords ? (
        <section className="pt-12" aria-labelledby="empty">
          <h1 id="empty" className="max-w-[18ch] text-[30px] font-semibold leading-tight tracking-tight">Добави първите си думи.</h1>
          <p className="mt-4 max-w-[38ch] text-ink-2">Всяка дума, която добавиш, се връща за преговор точно когато започваш да я забравяш.</p>
          <Link href="/words/new" className="btn btn-primary mt-7 w-full">Добави дума</Link>
          <Link href="/scan" className="btn btn-secondary mt-3 w-full"><IconCamera width={22} height={22} />Снимай страница</Link>
        </section>
      ) : (
        <>
          <section className="pt-9" aria-labelledby="due">
            <p className="text-sm text-ink-2">За преговор днес</p>
            <h1 id="due" className="mt-1 flex items-baseline gap-3">
              <span className="text-[64px] font-semibold leading-none tracking-tight tabular-nums">{todo}</span>
              <span className="text-xl text-ink-2">{plural(todo, "дума", "думи")}</span>
            </h1>
            {todo > 0 ? (
              <>
                <p className="mt-2 text-ink-2">
                  Около {minutes} {plural(minutes, "минута", "минути")}
                  {s.newAvailable > 0 ? `. Нови: ${Math.min(s.newAvailable, todo)}.` : "."}
                </p>
                <Link href="/review" className="btn btn-primary mt-6 w-full">Започни преговор</Link>
              </>
            ) : (
              <>
                <p className="mt-2 max-w-[36ch] text-ink-2">
                  {s.reviewsToday > 0 ? "Всичко за днес е минато. Добра работа." : "Нищо не чака. Следващите думи ще се върнат по график."}
                </p>
                <Link href="/words/new" className="btn btn-secondary mt-6 w-full">Добави дума</Link>
              </>
            )}
          </section>

          <section className="mt-10 border-t border-line pt-6" aria-labelledby="stat">
            <h2 id="stat" className="text-base font-semibold">Речникът ти</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {s.total} {plural(s.total, "дума", "думи")}: {s.counts.known} усвоени, {s.counts.learning} в учене, {s.counts.new} нови.
            </p>
            <div className="mt-4 flex gap-3">
              <Link href="/words" className="btn btn-secondary flex-1">Речник</Link>
              <Link href="/words/new" className="btn btn-secondary flex-1">Добави дума</Link>
            </div>
          </section>
        </>
      )}

      {hasWords && (
        <section className="mt-10 border-t border-line pt-6" aria-labelledby="newpage">
          <h2 id="newpage" className="text-base font-semibold">Нова страница</h2>
          <p className="mt-1 max-w-[34ch] text-[15px] text-ink-2">Подчертай непознатите думи в помагалото, снимай страницата и ги добави в речника.</p>
          <Link href="/scan" className="btn btn-secondary mt-4 w-full"><IconCamera width={22} height={22} />Снимай страница</Link>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="recent">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-base font-semibold">Последни страници</h2>
            <Link href="/pages" className="text-sm text-ink-2 underline-offset-4 hover:underline">Всички</Link>
          </div>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/pages/${p.id}`} className="flex items-center gap-4 py-3 active:bg-surface">
                  <Image src={`/api/sources/${p.id}/image`} alt="" width={48} height={64} unoptimized className="h-16 w-12 shrink-0 rounded-[4px] border border-line object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-ink-2">{p.words} {plural(p.words, "дума", "думи")}</p>
                  </div>
                  <IconChevron width={20} height={20} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

import Link from "next/link";
import { requireActive } from "@/core/auth/session";
import { StatusMark } from "@/design/status-mark";
import { listWords } from "@/modules/vocab/service";

export const metadata = { title: "Речник" };

const filters = [
  { v: "", label: "Всички" },
  { v: "new", label: "Нови" },
  { v: "learning", label: "В учене" },
  { v: "known", label: "Усвоени" },
] as const;

export default async function Words({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const { user } = await requireActive();
  const { q = "", s = "" } = await searchParams;
  const status = s === "new" || s === "learning" || s === "known" ? s : undefined;
  const all = await listWords(user.id);
  const needle = q.trim().toLowerCase();
  const words = all.filter(
    (w) =>
      (!status || w.status === status) &&
      (!needle || w.lemma.includes(needle) || w.translationBg.toLowerCase().includes(needle) || (w.phrase ?? "").includes(needle)),
  );
  const href = (v: string) => `/words?${new URLSearchParams({ ...(q ? { q } : {}), ...(v ? { s: v } : {}) })}`;

  return (
    <main>
      <header className="flex items-center justify-between py-2">
        <h1 className="text-2xl font-semibold tracking-tight">Речник</h1>
        <div className="flex items-center gap-2">
          <Link href="/pages" className="px-2 text-[15px] text-ink-2 underline underline-offset-4">Страници</Link>
          <Link href="/words/new" className="btn btn-secondary !min-h-11 !px-4 text-[15px]">
            Добави дума
          </Link>
        </div>
      </header>

      {all.length === 0 ? (
        <div className="mt-6 border-t border-line pt-8">
          <p className="max-w-[30ch] text-lg font-medium">Тук ще се събират думите, които учиш.</p>
          <p className="mt-2 max-w-[40ch] text-ink-2">Всяка дума е с превод и изречението, в което си я срещнал. Засега можеш да ги добавяш ръчно.</p>
          <Link href="/words/new" className="btn btn-primary mt-6">Добави първата дума</Link>
        </div>
      ) : (
        <>
          <form action="/words" className="mt-3">
            {status && <input type="hidden" name="s" value={status} />}
            <label htmlFor="q" className="sr-only">Търсене в речника</label>
            <input id="q" name="q" defaultValue={q} className="field !min-h-12 !text-[16px] !font-[family-name:var(--font-ui)]" placeholder="Търси дума или превод" type="search" autoCapitalize="none" autoCorrect="off" />
          </form>
          <nav aria-label="Филтър по статус" className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map((f) => {
              const on = (status ?? "") === f.v;
              return (
                <Link key={f.v} href={href(f.v)} aria-current={on ? "true" : undefined} className="shrink-0 rounded-full px-4 py-2 text-[14px] font-medium" style={on ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--surface-2)", color: "var(--ink-2)" }}>
                  {f.label}
                </Link>
              );
            })}
          </nav>
          {words.length === 0 ? (
            <p className="mt-8 text-ink-2">Нищо не съвпада.</p>
          ) : (
            <ul className="stagger mt-3 divide-y divide-line border-y border-line">
              {words.map((w) => (
                <li key={w.id}>
                  <Link href={`/words/${w.id}`} className="flex items-center justify-between gap-4 py-3 active:bg-surface">
                    <div className="min-w-0">
                      <p className="read truncate text-[19px] font-medium">{w.phrase ?? w.lemma}</p>
                      <p className="truncate text-[15px] text-ink-2">{w.translationBg}</p>
                    </div>
                    <StatusMark status={w.status as "new" | "learning" | "known"} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

import { requireActive } from "@/core/auth/session";
import { getStats } from "@/modules/review/service";

export const metadata = { title: "Напредък" };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const dayFmt = new Intl.DateTimeFormat("bg-BG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function Progress() {
  const { user } = await requireActive();
  const s = await getStats(user.id);
  const max = Math.max(1, ...s.days.map((d) => d.n));
  const rows = [
    { label: "Нови", n: s.counts.new, note: "още не са преговаряни" },
    { label: "В учене", n: s.counts.learning, note: "връщат се по график" },
    { label: "Усвоени", n: s.counts.known, note: "паметта им издържа 3+ седмици" },
  ];

  return (
    <main>
      <h1 className="py-3 text-2xl font-semibold tracking-tight">Напредък</h1>

      {s.total === 0 ? (
        <div className="mt-6 border-t border-line pt-8">
          <p className="max-w-[30ch] text-lg font-medium">Още няма какво да се покаже.</p>
          <p className="mt-2 max-w-[40ch] text-ink-2">След първите думи и първия преговор тук ще виждаш колко са нови, колко са в учене и колко вече знаеш.</p>
        </div>
      ) : (
        <>
          <section className="mt-2" aria-label="Думи по статус">
            <ul className="divide-y divide-line border-y border-line">
              {rows.map((r) => (
                <li key={r.label} className="flex items-baseline justify-between gap-4 py-4">
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-sm text-ink-2">{r.note}</p>
                  </div>
                  <p className="text-[32px] font-semibold leading-none tabular-nums">{r.n}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-6" aria-label="Серия и точност">
            <div>
              <p className="text-sm text-ink-2">Серия</p>
              <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums">{s.streak}</p>
              <p className="mt-1 text-sm text-ink-2">{plural(s.streak, "ден подред", "дни подред")}</p>
            </div>
            <div>
              <p className="text-sm text-ink-2">Верни за 30 дни</p>
              <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums">{s.retention === null ? "—" : `${s.retention}%`}</p>
              <p className="mt-1 text-sm text-ink-2">{s.retention === null ? "нужни са поне 10 отговора" : "от всички отговори"}</p>
            </div>
          </section>

          <section className="mt-10 border-t border-line pt-6" aria-labelledby="act">
            <h2 id="act" className="text-base font-semibold">Последните 14 дни</h2>
            <div
              className="mt-4 flex h-28 items-end gap-1.5"
              role="img"
              aria-label={`Отговори по дни: ${s.days.map((d) => `${dayFmt.format(new Date(d.day))} ${d.n}`).join(", ")}`}
            >
              {s.days.map((d) => (
                <div key={d.day} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, background: d.n ? "var(--accent)" : "var(--surface-2)" }} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-3">
              <span>преди 13 дни</span>
              <span>днес</span>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

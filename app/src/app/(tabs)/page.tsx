import Image from "next/image";
import Link from "next/link";
import { IconCamera, IconChevron, IconSettings } from "@/design/icons";

/* Примерни данни за макета. В Етап 2–3 идват от базата. */
const recent = [
  { id: 1, title: "Страница от 3 ноември", date: "вчера", words: 14, img: "/mock/p1.jpg" },
  { id: 2, title: "Страница от 1 ноември", date: "пет, 1 ноем.", words: 9, img: "/mock/p2.jpg" },
  { id: 3, title: "Страница от 29 октомври", date: "ср, 29 окт.", words: 17, img: "/mock/p3.jpg" },
];

export default function Today() {
  return (
    <main>
      <header className="flex items-center justify-between py-2">
        <div className="flex items-baseline gap-2">
          <span className="relative text-[19px] font-semibold tracking-tight">
            Подчертано
            <span className="wave-line absolute inset-x-0 -bottom-[7px]" style={{ height: 5 }} />
          </span>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">12</span> дни подред
          </p>
          <Link href="/settings" aria-label="Настройки" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
            <IconSettings width={22} height={22} />
          </Link>
        </div>
      </header>

      <section className="pt-9" aria-labelledby="due">
        <p className="text-sm text-ink-2">За преговор днес</p>
        <h1 id="due" className="mt-1 flex items-baseline gap-3">
          <span className="text-[64px] font-semibold leading-none tracking-tight tabular-nums">18</span>
          <span className="text-xl text-ink-2">думи</span>
        </h1>
        <p className="mt-2 text-ink-2">Около 9 минути. Пет от тях са нови.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/review" className="btn btn-primary flex-1">
            Започни преговор
          </Link>
        </div>
      </section>

      <section className="mt-10 border-t border-line pt-6" aria-labelledby="new">
        <h2 id="new" className="text-base font-semibold">
          Нова страница
        </h2>
        <p className="mt-1 max-w-[34ch] text-[15px] text-ink-2">
          Подчертай непознатите думи в помагалото, снимай страницата и ги добави в речника.
        </p>
        <Link href="/pick" className="btn btn-secondary mt-4 w-full">
          <IconCamera width={22} height={22} />
          Снимай страница
        </Link>
      </section>

      <section className="mt-10" aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="text-base font-semibold">
            Последни страници
          </h2>
          <Link href="/words" className="text-sm text-ink-2 underline-offset-4 hover:underline">
            Всички
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {recent.map((p) => (
            <li key={p.id}>
              <Link href="/pick" className="flex items-center gap-4 py-3 active:bg-surface">
                <Image
                  src={p.img}
                  alt=""
                  width={48}
                  height={64}
                  className="h-16 w-12 shrink-0 rounded-[4px] border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="text-sm text-ink-2">
                    {p.words} думи · {p.date}
                  </p>
                </div>
                <IconChevron width={20} height={20} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

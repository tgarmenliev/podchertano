"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconBack } from "@/design/icons";

/* Примерен текст за макета (собствен, не от помагалото). */
const paragraphs = [
  "Last summer my cousin decided to give up his job in the city and move to a small village near the sea. At first, everyone thought he was making a terrible mistake, but he insisted that he needed a change.",
  "He rented an old house with a leaking roof and a garden full of weeds. Every morning he would get up early, walk along the beach and watch the fishermen prepare their boats.",
  "The locals were suspicious of him, because strangers rarely stayed in the village for more than a week. However, after a few months, they began to appreciate his enthusiasm and his willingness to help.",
  "He repaired the fence of the neighbour, who could not afford to hire a professional.",
];

/* Думите, които „намира“ автоматичното откриване в макета. */
const suggested = new Set(["give", "up", "suspicious", "enthusiasm", "willingness", "fence", "afford", "leaking"]);
const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

export default function Pick() {
  const tokens = useMemo(() => paragraphs.map((p) => p.split(" ")), []);
  const [on, setOn] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const seen = new Set<string>();
    tokens.forEach((p, pi) =>
      p.forEach((w, wi) => {
        const n = norm(w);
        if (suggested.has(n) && !seen.has(n)) {
          seen.add(n);
          s.add(`${pi}-${wi}`);
        }
      }),
    );
    return s;
  });
  const auto = useMemo(() => on.size, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2"
        style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}
      >
        <Link href="/" aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">Страница от 4 ноември</h1>
          <p className="text-xs text-ink-2">Избери думите, които не знаеш</p>
        </div>
        <button
          type="button"
          onClick={() => setOn(new Set())}
          disabled={on.size === 0}
          className="h-11 rounded-full px-3 text-sm text-ink-2 disabled:opacity-40"
        >
          Изчисти
        </button>
      </header>

      <main className="px-5 pb-40 pt-5">
        <p className="mb-6 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[14px] leading-snug text-ink-2">
          Отбелязахме {auto} думи, които изглеждат подчертани. Провери ги и докосни всяка друга, която искаш да добавиш.
        </p>

        <div className="read text-[20px] text-ink" style={{ lineHeight: 2.25 }}>
          {tokens.map((words, pi) => (
            <p key={pi} className="mb-5">
              {words.map((w, wi) => {
                const k = `${pi}-${wi}`;
                const isOn = on.has(k);
                const joined = isOn && on.has(`${pi}-${wi + 1}`);
                return (
                  <span key={k}>
                    <button
                      type="button"
                      className="mark cursor-pointer px-[2px] text-left align-baseline"
                      data-on={isOn}
                      data-joined={joined}
                      aria-pressed={isOn}
                      onClick={() => toggle(k)}
                    >
                      {w}
                    </button>{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg"
        style={{ paddingBottom: "max(var(--safe-bottom), 12px)" }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-4 px-5 pt-3">
          <p className="text-[15px]" aria-live="polite">
            <span className="font-semibold tabular-nums">{on.size}</span>{" "}
            <span className="text-ink-2">{on.size === 1 ? "избрана дума" : "избрани думи"}</span>
          </p>
          <button type="button" className="btn btn-primary ml-auto" disabled={on.size === 0}>
            Продължи
          </button>
        </div>
      </div>
    </div>
  );
}

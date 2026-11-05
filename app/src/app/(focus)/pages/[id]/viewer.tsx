"use client";

import { useMemo, useState } from "react";

type W = { i: number; t: string; x: number; y: number; w: number; h: number; line: number; para: number; sel: boolean };

/** Текст и снимка на запазената страница; избраните думи са подчертани с вълничка. */
export function Viewer({ id, words, width, height }: { id: string; words: W[]; width: number; height: number }) {
  const [tab, setTab] = useState<"text" | "photo">("text");
  const paras = useMemo(() => {
    const out: { para: number; words: W[] }[] = [];
    for (const w of words) {
      const last = out[out.length - 1];
      if (last && last.para === w.para) last.words.push(w);
      else out.push({ para: w.para, words: [w] });
    }
    return out;
  }, [words]);

  return (
    <section aria-label="Страницата" className="border-t border-line pt-6">
      <div role="tablist" className="grid grid-cols-2 text-[14px] font-medium">
        {(["text", "photo"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="relative h-10" style={{ color: tab === t ? "var(--ink)" : "var(--ink-3)" }}>
            {t === "text" ? "Текст" : "Снимка"}
            {tab === t && <span className="wave-line absolute inset-x-6 bottom-0" style={{ height: 4 }} />}
          </button>
        ))}
      </div>
      {tab === "text" ? (
        <div className="read mt-5 text-[18px] text-ink" style={{ lineHeight: 2.1 }}>
          {paras.length === 0 && <p className="text-ink-2">Няма запазен текст.</p>}
          {paras.map((p) => (
            <p key={p.para} className="mb-4">
              {p.words.map((w, k) => {
                const next = p.words[k + 1];
                const joined = w.sel && !!next?.sel && next.line === w.line;
                return (
                  <span key={w.i}>
                    <span className="mark px-[2px]" data-on={w.sel} data-joined={joined}>
                      {w.t}
                    </span>{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      ) : (
        <div className="relative mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/sources/${id}/image`} alt="Снимка на страницата" className="w-full rounded-[4px] border border-line" />
          {words
            .filter((w) => w.sel)
            .map((w) => (
              <span
                key={w.i}
                className="pointer-events-none absolute rounded-[2px]"
                style={{ left: `${(w.x / width) * 100}%`, top: `${(w.y / height) * 100}%`, width: `${(w.w / width) * 100}%`, height: `${(w.h / height) * 100}%`, background: "color-mix(in oklch, var(--accent) 28%, transparent)", outline: "1px solid var(--accent)" }}
              />
            ))}
        </div>
      )}
    </section>
  );
}

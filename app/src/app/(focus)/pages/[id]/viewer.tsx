"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconSpeaker } from "@/design/icons";
import { cleanEdges, sentenceAround } from "@/modules/scan/sentences";
import type { Enriched } from "@/core/ai/enrich";
import { enrichAction } from "../../scan/actions";
import { addFromPageAction } from "../actions";

type W = { i: number; t: string; x: number; y: number; w: number; h: number; line: number; para: number; sel: boolean };
export type SavedRef = { id: string; key: string };

/*
  Текст и снимка на запазената страница.
  Докосни която и да е дума за превод според изречението; докосни съседна, за да станат фраза.
*/
export function Viewer({ id, words, width, height, saved, aiAvailable }: { id: string; words: W[]; width: number; height: number; saved: SavedRef[]; aiAvailable: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"text" | "photo">("text");
  const [range, setRange] = useState<[number, number] | null>(null);
  const paras = useMemo(() => {
    const out: { para: number; words: W[] }[] = [];
    for (const w of words) {
      const last = out[out.length - 1];
      if (last && last.para === w.para) last.words.push(w);
      else out.push({ para: w.para, words: [w] });
    }
    return out;
  }, [words]);
  const byId = useMemo(() => new Map(words.map((w) => [w.i, w])), [words]);

  function tap(w: W) {
    setRange((r) => {
      if (!r) return [w.i, w.i];
      const [a, b] = r;
      if (a === b && w.i === a) return null; // втори допир на същата дума затваря
      const line = byId.get(a)!.line;
      const sameLine = w.line === line && byId.get(b)!.line === line;
      if (sameLine && w.i === b + 1) return [a, w.i];
      if (sameLine && w.i === a - 1) return [w.i, b];
      return [w.i, w.i];
    });
  }

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
        <>
          <p className="mt-4 text-[14px] text-ink-2">Докосни дума за превод според изречението. Докосни и съседна, за да станат фраза.</p>
          <div className="read mt-3 text-[18px] text-ink" style={{ lineHeight: 2.1, paddingBottom: range ? 320 : 0 }}>
            {paras.length === 0 && <p className="text-ink-2">Няма запазен текст.</p>}
            {paras.map((p) => (
              <p key={p.para} className="mb-4">
                {p.words.map((w, k) => {
                  const next = p.words[k + 1];
                  const inRange = !!range && w.i >= range[0] && w.i <= range[1];
                  const on = w.sel || inRange;
                  const nextOn = !!next && (next.sel || (!!range && next.i >= range[0] && next.i <= range[1]));
                  return (
                    <span key={w.i}>
                      <button type="button" className="mark cursor-pointer rounded px-[2px] text-left align-baseline active:bg-surface" data-on={on} data-joined={on && nextOn && next.line === w.line} onClick={() => tap(w)}>
                        {w.t}
                      </button>{" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
          {range && <LookupSheet key={`${range[0]}-${range[1]}`} sourceId={id} words={words} range={range} saved={saved} aiAvailable={aiAvailable} onClose={() => setRange(null)} onAdded={() => router.refresh()} />}
        </>
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

type Phase = "loading" | "ready" | "error" | "adding" | "added";

function LookupSheet({ sourceId, words, range, saved, aiAvailable, onClose, onAdded }: { sourceId: string; words: W[]; range: [number, number]; saved: SavedRef[]; aiAvailable: boolean; onClose: () => void; onAdded: () => void }) {
  const ids = useMemo(() => words.filter((w) => w.i >= range[0] && w.i <= range[1]).map((w) => w.i), [words, range]);
  const surface = useMemo(() => cleanEdges(words.filter((w) => ids.includes(w.i)).map((w) => w.t).join(" ")), [words, ids]);
  const sentence = useMemo(() => sentenceAround(words, range[0]), [words, range]);
  const [phase, setPhase] = useState<Phase>(aiAvailable ? "loading" : "ready");
  const [res, setRes] = useState<Enriched | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const asked = useRef(false);
  const known = saved.find((s) => s.key === surface.toLowerCase() || (res && s.key === (res.phrase ?? res.lemma).toLowerCase()));

  useEffect(() => {
    if (!aiAvailable || asked.current) return;
    asked.current = true;
    let live = true;
    enrichAction([{ id: 0, surface, sentence }]).then((r) => {
      if (!live) return;
      if (r.ok && r.items[0]) {
        setRes(r.items[0]);
        setPhase("ready");
      } else {
        setErr(r.ok ? "Не получих превод. Опитай пак." : r.error);
        setPhase("error");
      }
    });
    return () => {
      live = false;
    };
  }, [aiAvailable, surface, sentence]);

  const translation = res?.translation_bg ?? manual.trim();

  async function add() {
    if (!translation) return;
    setPhase("adding");
    const r = await addFromPageAction({
      sourceId,
      wordIds: ids,
      surface,
      sentence,
      lemma: (res?.lemma ?? surface).toLowerCase(),
      translationBg: translation,
      translationAltBg: res?.translation_alt_bg ?? null,
      meaningBg: res?.meaning_bg ?? null,
      exampleEn: res?.example_en ?? null,
      pos: res && res.pos !== "other" ? res.pos : "",
      phrase: res?.phrase ?? (ids.length > 1 ? surface.toLowerCase() : null),
    });
    if (!r.ok) {
      setErr(r.error);
      setPhase("error");
      return;
    }
    setPhase("added");
    onAdded();
    setTimeout(onClose, 900);
  }

  function speak() {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(surface);
    u.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  return (
    <div role="dialog" aria-label={`Превод на „${surface}“`} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
      <div className="mx-auto max-h-[62vh] max-w-xl overflow-y-auto px-5 pb-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="read text-[26px] font-medium leading-tight">{surface}</p>
          <div className="-mr-2 flex shrink-0 items-center">
            <button type="button" aria-label="Чуй" className="grid h-10 w-10 place-items-center rounded-full text-ink-2 active:bg-surface" onClick={speak}>
              <IconSpeaker width={20} height={20} />
            </button>
            <button type="button" aria-label="Затвори" className="grid h-10 w-10 place-items-center rounded-full text-ink-2 active:bg-surface" onClick={onClose}>
              <IconClose width={20} height={20} />
            </button>
          </div>
        </div>

        {phase === "loading" && (
          <div role="status" aria-live="polite" className="mt-4">
            <p className="text-ink-2">Превеждам според изречението…</p>
            <div className="wave-line mt-2 w-24" />
          </div>
        )}

        {res && (
          <div className="mt-3">
            <p className="text-[22px] font-medium leading-snug">{res.translation_bg}</p>
            {res.translation_alt_bg && <p className="mt-1 text-ink-2">Още: {res.translation_alt_bg}</p>}
            {res.meaning_bg && <p className="mt-3 text-[15px] leading-snug">{res.meaning_bg}</p>}
            {res.example_en && <p className="read mt-2 text-[16px] italic leading-snug text-ink-2">{res.example_en}</p>}
          </div>
        )}

        {!aiAvailable && phase !== "added" && (
          <div className="mt-4">
            <label htmlFor="manual" className="mb-2 block text-sm text-ink-2">Превод на български</label>
            <input id="manual" className="field !min-h-12 !text-[17px] !font-[family-name:var(--font-ui)]" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" maxLength={120} />
          </div>
        )}

        {err && <p role="alert" className="mt-3 text-[15px]">{err}</p>}

        <div className="mt-4 flex gap-2 pb-1">
          {phase === "added" ? (
            <p role="status" className="py-3 text-[15px] font-medium" style={{ color: "var(--ok)" }}>Добавена в речника.</p>
          ) : known ? (
            <Link href={`/words/${known.id}`} className="btn btn-secondary flex-1">Вече е в речника</Link>
          ) : (
            <button type="button" className="btn btn-primary flex-1" onClick={add} disabled={!translation || phase === "adding" || phase === "loading"}>
              {phase === "adding" ? "Добавям…" : "Добави в речника"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

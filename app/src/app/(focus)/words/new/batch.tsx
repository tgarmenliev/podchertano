"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Enriched } from "@/core/ai/enrich";
import { posLabel } from "@/modules/vocab/pos";
import { MAX_BATCH, parseWordList } from "@/modules/vocab/wordlist";
import { keepFocus } from "@/design/keep-focus";
import { enrichAction } from "../../scan/actions";
import { saveWordsAction } from "../actions";

type Row = { key: string; surface: string; res: Enriched | null; translation: string; on: boolean };
type Phase = "input" | "loading" | "review" | "saving" | "done";
const BATCH = 8;

/** Няколко думи наведнъж: списък -> AI превежда на партиди -> преглеждаш, поправяш, махаш -> добавяш всички. */
export function BatchForm() {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; already: number; failed: number } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const parsed = parseWordList(text);

  async function translate(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.words.length) return;
    setError(null);
    setPhase("loading");
    const list = parsed.words;
    setProg({ done: 0, total: list.length });
    const out: Row[] = list.map((w, i) => ({ key: `${i}-${w}`, surface: w, res: null, translation: "", on: false }));
    let stopped: string | null = null;
    for (let k = 0; k < list.length; k += BATCH) {
      const slice = list.slice(k, k + BATCH);
      const r = await enrichAction(slice.map((w, j) => ({ id: k + j, surface: w, sentence: "" })));
      if (!r.ok) {
        stopped = r.error;
        break;
      }
      for (const it of r.items) {
        const row = out[it.id];
        if (row) {
          row.res = it;
          row.translation = it.translation_bg;
          row.on = true;
        }
      }
      setProg({ done: Math.min(k + BATCH, list.length), total: list.length });
    }
    if (!out.some((r) => r.res)) {
      setError(stopped ?? "Не получих преводи. Опитай пак.");
      setPhase("input");
      return;
    }
    setError(stopped ? `${stopped} Преведох само част от думите.` : null);
    setRows(out);
    setPhase("review");
  }

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.on && r.translation.trim());

  async function save() {
    if (!chosen.length) return;
    setPhase("saving");
    const r = await saveWordsAction(
      chosen.map((c) => ({
        lemma: c.res?.lemma ?? c.surface,
        translation: c.translation,
        alt: c.res?.translation_alt_bg ?? null,
        meaning: c.res?.meaning_bg ?? null,
        example: c.res?.example_en ?? null,
        pos: c.res?.pos ?? "",
        phrase: c.res?.phrase ?? null,
      })),
    );
    if (!r.ok) {
      setError(r.error);
      setPhase("review");
      return;
    }
    setSummary(r);
    setPhase("done");
  }

  function again() {
    setRows([]);
    setText("");
    setSummary(null);
    setError(null);
    setPhase("input");
    setTimeout(() => areaRef.current?.focus(), 0);
  }

  if (phase === "done" && summary) {
    return (
      <div className="enter" role="status">
        <p className="text-[22px] font-semibold leading-tight">
          Добавени: {summary.added}
          <span className="wave-line wave-draw mt-2 block w-20" />
        </p>
        {summary.already > 0 && <p className="mt-4 text-ink-2">Вече бяха в речника: {summary.already}.</p>}
        {summary.failed > 0 && <p className="mt-2 text-ink-2">Не се записаха: {summary.failed}.</p>}
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/words" className="btn btn-primary w-full">Към речника</Link>
          <button type="button" className="btn btn-secondary w-full" onClick={again}>Още думи</button>
        </div>
      </div>
    );
  }

  if (phase === "review" || phase === "saving") {
    return (
      <div className="enter pb-28">
        <p className="text-[15px] text-ink-2">Провери преводите. Махни отметката на думите, които не искаш.</p>
        {error && <p role="alert" className="mt-3 text-[15px]">{error}</p>}
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.key} className="py-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Добави „${r.surface}“`}
                  className="mt-1 h-6 w-6 shrink-0 accent-[var(--accent-strong)]"
                  checked={r.on}
                  onChange={(e) => set(r.key, { on: e.target.checked })}
                  disabled={phase === "saving"}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="read text-[20px] font-medium">{r.res?.phrase ?? r.res?.lemma ?? r.surface}</span>
                    {r.res && r.res.pos !== "other" && <span className="text-sm text-ink-2">{posLabel(r.res.pos)}</span>}
                  </p>
                  <input
                    className="field mt-2 !min-h-11 !text-[17px] !font-[family-name:var(--font-ui)]"
                    value={r.translation}
                    onChange={(e) => set(r.key, { translation: e.target.value, on: e.target.value.trim() ? r.on || !r.res : false })}
                    placeholder={r.res ? "" : "Няма превод: напиши го"}
                    maxLength={120}
                    aria-label={`Превод на ${r.surface}`}
                    disabled={phase === "saving"}
                  />
                  {r.res?.meaning_bg && <p className="mt-2 text-[14px] leading-snug text-ink-2">{r.res.meaning_bg}</p>}
                  {r.res?.example_en && <p className="read mt-1 text-[15px] italic leading-snug text-ink-3">{r.res.example_en}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg px-5 pt-3" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
          <div className="mx-auto flex max-w-xl gap-2">
            <button type="button" className="btn btn-ghost" onClick={again} disabled={phase === "saving"}>Откажи</button>
            <button type="button" className="btn btn-primary flex-1" onMouseDown={keepFocus} onClick={save} disabled={!chosen.length || phase === "saving"}>
              {phase === "saving" ? "Добавям…" : `Добави ${chosen.length} ${chosen.length === 1 ? "дума" : "думи"}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const busy = phase === "loading";
  return (
    <form onSubmit={translate} className="space-y-5">
      <div>
        <label htmlFor="list" className="mb-2 block text-sm text-ink-2">Думите на английски: по една на ред или със запетая</label>
        <textarea
          id="list"
          ref={areaRef}
          className="field !h-48 !py-3 !text-[19px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"reckon\nsturdy casing\ngive up"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          autoFocus
        />
        <p className="mt-2 text-sm text-ink-2">
          {parsed.words.length > 0 ? `${parsed.words.length} ${parsed.words.length === 1 ? "дума" : "думи"}` : "Изразите с няколко думи (give up) остават цели."}
          {parsed.dropped > 0 ? ` Най-много ${MAX_BATCH} наведнъж; още ${parsed.dropped} не са включени.` : ""}
        </p>
      </div>
      {error && <p role="alert" className="text-[15px]">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={busy || !parsed.words.length}>
        {busy ? `Превеждам… ${prog.done} от ${prog.total}` : "Преведи всички"}
      </button>
      {busy && <div role="status" className="wave-line wave-loading w-24" aria-label="Превеждам" />}
    </form>
  );
}

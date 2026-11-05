"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepFocus } from "@/design/keep-focus";
import { IconBack, IconCamera, IconClose } from "@/design/icons";
import { ImageError } from "@/modules/scan/image";
import { scanPage, type Step } from "@/modules/scan/ocr";
import { itemsFromSelection, paragraphs, type Item } from "@/modules/scan/sentences";
import type { ScanResult, ScanWord } from "@/modules/scan/types";
import { enrichAction, saveScanAction } from "./actions";

type Stage = "start" | "working" | "pick" | "words" | "saving";
type Draft = Item & { key: string; lemma: string; translation: string; alt: string; meaning: string; example: string; pos: string; phrase: string | null };

const stepText: Record<Step, string> = {
  prepare: "Подготвям снимката",
  load: "Зареждам разпознаването",
  read: "Чета текста",
  underline: "Търся подчертаното",
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ScanFlow({ aiAvailable }: { aiAvailable: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("start");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("prepare");
  const [pct, setPct] = useState(0);
  const [passNo, setPassNo] = useState(1);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [words, setWords] = useState<ScanWord[]>([]);
  const [auto, setAuto] = useState(0);
  const [tab, setTab] = useState<"text" | "photo">("text");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [extras, setExtras] = useState<{ surface: string; sentence: string }[]>([]);
  const [xWord, setXWord] = useState("");
  const [xSent, setXSent] = useState("");
  const photoUrl = useRef<string | null>(null);

  useEffect(() => () => void (photoUrl.current && URL.revokeObjectURL(photoUrl.current)), []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("working");
    setStep("prepare");
    setPct(0);
    try {
      const r = await scanPage(file, (s, p, k) => {
        setStep(s);
        if (s === "read") {
          setPct(p ?? 0);
          setPassNo(k ?? 1);
        }
      });
      if (r.words.length < 5) throw new ImageError("Почти не намерих текст. Снимай по-отблизо и на по-добра светлина.");
      photoUrl.current = URL.createObjectURL(r.image);
      setResult(r);
      setWords(r.words);
      setAuto(r.words.filter((w) => w.auto).length);
      setStage("pick");
    } catch (e) {
      setError(e instanceof ImageError ? e.message : "Не успях да разчета страницата. Опитай пак на по-добра светлина.");
      setStage("start");
    }
  }

  const paras = useMemo(() => paragraphs(words), [words]);
  const selected = words.filter((w) => w.sel).length + extras.length;
  const toggle = (i: number) => setWords((ws) => ws.map((w) => (w.i === i ? { ...w, sel: !w.sel } : w)));

  function toWords() {
    setAiMsg(null);
    const fromText = itemsFromSelection(words);
    const manual: Item[] = extras.map((x, k) => ({ ids: [-1 - k], surface: x.surface, sentence: x.sentence || x.surface }));
    setDrafts(
      [...fromText, ...manual].map((it) => ({
        ...it,
        key: it.ids.join("-"),
        lemma: it.surface.toLowerCase(),
        translation: "",
        alt: "",
        meaning: "",
        example: "",
        pos: "",
        phrase: it.ids.length > 1 ? it.surface.toLowerCase() : null,
      })),
    );
    setStage("words");
  }

  // с включен AI превежда веднага след избора (една заявка за цялата страница)
  const autoRan = useRef(false);
  useEffect(() => {
    if (stage === "words" && aiAvailable && !autoRan.current && drafts.length > 0 && drafts.every((d) => !d.translation)) {
      autoRan.current = true;
      void autofill();
    }
    if (stage === "pick") autoRan.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, drafts.length]);

  async function autofill() {
    setBusy(true);
    setAiMsg(null);
    const res = await enrichAction(drafts.map((d, i) => ({ id: i, surface: d.surface, sentence: d.sentence })));
    setBusy(false);
    if (!res.ok) return setAiMsg(res.error);
    setDrafts((ds) =>
      ds.map((d, i) => {
        const e = res.items.find((x) => x.id === i);
        if (!e) return d;
        return { ...d, lemma: e.lemma, translation: e.translation_bg, alt: e.translation_alt_bg ?? "", meaning: e.meaning_bg ?? "", example: e.example_en ?? "", pos: e.pos === "other" ? "" : e.pos, phrase: e.phrase ?? d.phrase };
      }),
    );
    setAiMsg("Попълнено. Провери преводите, преди да запазиш.");
  }

  const ready = drafts.length > 0 && drafts.every((d) => d.translation.trim());
  const filled = drafts.filter((d) => d.translation.trim());

  async function save(only: Draft[]) {
    if (!result || !only.length) return;
    setStage("saving");
    const savedIds = new Set(only.flatMap((d) => d.ids));
    const wordsOut = words.map((w) => ({ ...w, sel: savedIds.has(w.i) })); // в страницата остават отбелязани само запазените думи
    const fd = new FormData();
    fd.set("image", new File([result.image], "page.jpg", { type: "image/jpeg" }));
    fd.set(
      "data",
      JSON.stringify({
        width: result.width,
        height: result.height,
        words: wordsOut,
        items: only.map((d) => ({
          lemma: d.lemma.trim().toLowerCase(),
          surfaceForm: d.surface,
          sentence: d.sentence,
          translationBg: d.translation.trim(),
          translationAltBg: d.alt.trim() || null,
          meaningBg: d.meaning.trim() || null,
          exampleEn: d.example.trim() || null,
          pos: d.pos,
          phrase: d.phrase,
          phraseKind: d.pos === "phrasal verb" ? "phrasal_verb" : d.pos === "idiom" ? "idiom" : d.phrase ? "collocation" : null,
        })),
      }),
    );
    const r = await saveScanAction(fd);
    if (!r.ok) {
      setError(r.error);
      setStage("words");
      return;
    }
    router.replace(`/pages/${r.sourceId}?new=${r.created}`);
  }

  function leave(e: React.MouseEvent) {
    if ((stage === "pick" || stage === "words") && !confirm("Да изоставя ли тази страница? Изборът ти няма да се запази.")) e.preventDefault();
  }

  /* ───── Начало ───── */
  if (stage === "start" || stage === "working") {
    const idx = (["prepare", "load", "read", "underline"] as Step[]).indexOf(step);
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 8px)", paddingBottom: "max(var(--safe-bottom), 20px)" }}>
        <header className="flex h-11 items-center">
          <Link href="/" aria-label="Затвори" className="-ml-3 grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
            <IconClose />
          </Link>
        </header>
        {stage === "start" ? (
          <>
            <div className="mt-6">
              <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Снимай страница</h1>
              <p className="mt-4 max-w-[38ch] text-ink-2">Подчертай непознатите думи с молив, постави страницата на светло и снимай целия текст. Ние ще отбележим подчертаните думи, а ти ще ги провериш.</p>
              <ul className="mt-6 max-w-[40ch] space-y-2 text-[15px] text-ink-2">
                <li>Дръж телефона успоредно на страницата.</li>
                <li>Избягвай сянка от ръката или телефона.</li>
                <li>Целият текст да се вижда в кадъра.</li>
              </ul>
            </div>
            {error && (
              <p role="alert" className="mt-6 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[15px]">
                {error}
              </p>
            )}
            <div className="mt-auto flex flex-col gap-2 pt-10">
              <label className="btn btn-primary w-full cursor-pointer">
                <IconCamera width={22} height={22} />
                Снимай с камерата
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <label className="btn btn-secondary w-full cursor-pointer">
                Избери от галерията
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <p className="pt-2 text-center text-sm text-ink-2">Снимката се обработва на телефона. Запазва се само за теб.</p>
            </div>
          </>
        ) : (
          <div className="mt-16" role="status" aria-live="polite">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{stepText[step]}…</h1>
            <div className="relative mt-6 h-[6px]">
              <div className="absolute inset-0 top-[2px] h-[2px] rounded bg-line" />
              <div className="wave-line absolute inset-0" style={{ clipPath: `inset(0 ${100 - Math.round(((idx + (step === "read" ? pct : 0)) / 4) * 100)}% 0 0)`, transition: "clip-path .3s var(--ease-out)" }} />
            </div>
            <ol className="mt-8 space-y-2 text-[15px]">
              {(["prepare", "load", "read", "underline"] as Step[]).map((s, k) => (
                <li key={s} className={k < idx ? "text-ink-2" : k === idx ? "font-medium" : "text-ink-3"}>
                  {k < idx ? "✓ " : ""}
                  {stepText[s]}
                  {s === "read" && step === "read" ? ` ${Math.round(pct * 100)}% (проход ${passNo} от 3)` : ""}
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-[38ch] text-sm text-ink-2">Четем страницата три пъти по различен начин, за да не изпуснем думи (имена, думи в края на реда). Първият път отнема по-дълго, защото се зарежда разпознаването.</p>
          </div>
        )}
      </div>
    );
  }

  /* ───── Избор на думи ───── */
  if (stage === "pick" && result) {
    return (
      <div className="mx-auto min-h-dvh max-w-xl">
        <header className="sticky top-0 z-20 border-b border-line bg-bg" style={{ paddingTop: "var(--safe-top)" }}>
          <div className="flex h-[52px] items-center gap-2 px-2">
            <Link href="/" onClick={leave} aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
              <IconBack />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight">Избери думите</h1>
              <p className="text-xs text-ink-2">Докосни, за да добавиш или махнеш</p>
            </div>
            <button type="button" onClick={() => setWords((ws) => ws.map((w) => ({ ...w, sel: false })))} disabled={selected === 0} className="h-11 rounded-full px-3 text-sm text-ink-2 disabled:opacity-40">
              Изчисти
            </button>
          </div>
          <div role="tablist" className="grid grid-cols-2 px-5 text-[14px] font-medium">
            {(["text", "photo"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="relative h-10" style={{ color: tab === t ? "var(--ink)" : "var(--ink-3)" }}>
                {t === "text" ? "Текст" : "Снимка"}
                {tab === t && <span className="wave-line absolute inset-x-6 bottom-0" style={{ height: 4 }} />}
              </button>
            ))}
          </div>
        </header>

        <main className="px-5 pb-40 pt-5">
          {tab === "text" ? (
            <>
              <p className="mb-6 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[14px] leading-snug text-ink-2">
                {auto > 0 ? `Отбелязахме ${auto} думи, които изглеждат подчертани. Провери ги и докосни всяка друга, която искаш да добавиш.` : "Не открихме подчертани думи. Докосни думите, които искаш да добавиш."}
              </p>
              <div className="read text-[20px] text-ink" style={{ lineHeight: 2.25 }}>
                {paras.map((p) => (
                  <p key={p.para} className="mb-5">
                    {p.words.map((w, k) => {
                      const next = p.words[k + 1];
                      const joined = w.sel && !!next && next.sel && next.line === w.line;
                      return (
                        <span key={w.i}>
                          <button type="button" className="mark cursor-pointer px-[2px] text-left align-baseline" data-on={w.sel} data-joined={joined} aria-pressed={w.sel} onClick={() => toggle(w.i)}>
                            {w.t}
                          </button>{" "}
                        </span>
                      );
                    })}
                  </p>
                ))}
              </div>

              <section className="mt-8 border-t border-line pt-5" aria-labelledby="miss">
                <h2 id="miss" className="text-base font-semibold">Липсва дума?</h2>
                <p className="mt-1 text-[14px] text-ink-2">Ако думата не е в текста горе, напиши я тук.</p>
                <div className="mt-3 space-y-2">
                  <input className="field !min-h-12 !text-[17px]" placeholder="дума на английски" value={xWord} onChange={(e) => setXWord(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={60} aria-label="Липсваща дума" />
                  <input className="field !min-h-12 !text-[16px]" placeholder="изречението (по желание)" value={xSent} onChange={(e) => setXSent(e.target.value)} autoCapitalize="none" spellCheck={false} maxLength={300} aria-label="Изречение за липсващата дума" />
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    disabled={!xWord.trim()}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setExtras((x) => [...x, { surface: xWord.trim(), sentence: xSent.trim() }]);
                      setXWord("");
                      setXSent("");
                    }}
                  >
                    Добави към избраните
                  </button>
                </div>
                {extras.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {extras.map((x, k) => (
                      <li key={k} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-[14px]">
                        {x.surface}
                        <button type="button" aria-label={`Махни „${x.surface}“`} className="grid h-8 w-8 place-items-center rounded-full text-ink-3" onClick={() => setExtras((e) => e.filter((_, j) => j !== k))}>
                          <IconClose width={16} height={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl.current ?? ""} alt="Снимка на страницата" className="w-full rounded-[4px] border border-line" />
              {words
                .filter((w) => w.sel)
                .map((w) => (
                  <span
                    key={w.i}
                    className="pointer-events-none absolute rounded-[2px]"
                    style={{ left: `${(w.x / result.width) * 100}%`, top: `${(w.y / result.height) * 100}%`, width: `${(w.w / result.width) * 100}%`, height: `${(w.h / result.height) * 100}%`, background: "color-mix(in oklch, var(--accent) 28%, transparent)", outline: "1px solid var(--accent)" }}
                  />
                ))}
            </div>
          )}
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg" style={{ paddingBottom: "max(var(--safe-bottom), 12px)" }}>
          <div className="mx-auto flex max-w-xl items-center gap-4 px-5 pt-3">
            <p className="text-[15px]" aria-live="polite">
              <span className="font-semibold tabular-nums">{selected}</span> <span className="text-ink-2">{selected === 1 ? "избрана дума" : "избрани думи"}</span>
            </p>
            <button type="button" className="btn btn-primary ml-auto" disabled={selected === 0} onClick={toWords}>
              Продължи
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ───── Преводи и запазване ───── */
  const saving = stage === "saving";
  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const f = "field !min-h-12 !text-[17px] !font-[family-name:var(--font-ui)]";
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <button type="button" onClick={() => setStage("pick")} aria-label="Назад към избора" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface" disabled={saving}>
          <IconBack />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">Преводи</h1>
          <p className="text-xs text-ink-2">{drafts.length} {drafts.length === 1 ? "дума" : "думи"} от страницата</p>
        </div>
      </header>

      <main className="px-5 pb-44 pt-5">
        {aiAvailable ? (
          <div className="mb-6">
            <button type="button" className="btn btn-secondary w-full" onClick={autofill} disabled={busy || saving || drafts.length === 0}>
              {busy ? "Попълваме…" : "Попълни автоматично"}
            </button>
            {aiMsg && <p role="status" className="mt-3 text-[14px] text-ink-2">{aiMsg}</p>}
          </div>
        ) : (
          <p className="mb-6 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[14px] leading-snug text-ink-2">Напиши превода на всяка дума. Изречението е показано, за да избереш значението, което е в текста.</p>
        )}

        {error && <p role="alert" className="mb-5 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[15px]">{error}</p>}

        <ul className="space-y-8">
          {drafts.map((d) => (
            <li key={d.key} className="border-t border-line pt-5">
              <div className="flex items-start justify-between gap-3">
                <p className="read text-[26px] font-medium leading-tight">{d.surface}</p>
                <button type="button" aria-label={`Махни „${d.surface}“`} className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 active:bg-surface" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} disabled={saving}>
                  <IconClose width={20} height={20} />
                </button>
              </div>
              <p className="read mt-2 text-[16px] italic leading-snug text-ink-2">
                <Hi sentence={d.sentence} surface={d.surface} />
              </p>
              <label className="mb-2 mt-4 block text-sm text-ink-2" htmlFor={`t-${d.key}`}>
                Превод на български
              </label>
              <input id={`t-${d.key}`} className={f} value={d.translation} onChange={(e) => update(d.key, { translation: e.target.value })} autoComplete="off" maxLength={120} disabled={saving} />
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-ink-2">Още полета</summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-ink-2" htmlFor={`l-${d.key}`}>Основна форма</label>
                    <input id={`l-${d.key}`} className={f} value={d.lemma} onChange={(e) => update(d.key, { lemma: e.target.value })} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={60} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-ink-2" htmlFor={`m-${d.key}`}>Значение (по желание)</label>
                    <input id={`m-${d.key}`} className={f} value={d.meaning} onChange={(e) => update(d.key, { meaning: e.target.value })} maxLength={220} />
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
        {drafts.length === 0 && <p className="text-ink-2">Няма останали думи. Върни се и избери отново.</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg" style={{ paddingBottom: "max(var(--safe-bottom), 12px)" }}>
        <div className="mx-auto max-w-xl px-5 pt-3">
          {!ready && filled.length > 0 && (
            <p className="mb-2 text-[13px] text-ink-2">
              {drafts.length - filled.length} без превод. Попълни ги или запази само готовите.
            </p>
          )}
          <button type="button" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={saving || filled.length === 0} onClick={() => save(ready ? drafts : filled)}>
            {saving ? "Запазваме…" : `Запази ${ready ? drafts.length : filled.length} ${(ready ? drafts.length : filled.length) === 1 ? "дума" : "думи"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Hi({ sentence, surface }: { sentence: string; surface: string }) {
  const m = new RegExp(`(?<![A-Za-z'])(${esc(surface)})(?![A-Za-z'])`, "i").exec(sentence);
  if (!m) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, m.index)}
      <span className="mark px-0.5 not-italic" data-on="true">
        {m[0]}
      </span>
      {sentence.slice(m.index + m[0].length)}
    </>
  );
}

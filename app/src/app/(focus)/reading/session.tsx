"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { findForm } from "@/core/ai/findform";
import type { ReadingQuestion } from "@/core/ai/reading";
import { IconCheck, IconClose } from "@/design/icons";
import { SpeakButton } from "@/design/speak";
import type { Completion, ReadingWord } from "@/modules/reading/service";
import { completeReadingAction, reportQuestionAction } from "./actions";

export type ReadingView = { id: string; title: string; paragraphs: string[]; words: ReadingWord[]; questions: ReadingQuestion[] };
type Phase = "read" | "quiz" | "result";

/** Откъси от абзац: обикновен текст и думи на ученика (първата поява на всяка). */
type Piece = { text: string; word?: ReadingWord };
function pieces(paragraphs: string[], words: ReadingWord[]): Piece[][] {
  const body = paragraphs.join("\n\n");
  const starts: number[] = [];
  let at = 0;
  for (const p of paragraphs) {
    starts.push(at);
    at += p.length + 2;
  }
  const hits = words
    .map((w) => ({ w, at: findForm(body, w.form) }))
    .filter((h): h is { w: ReadingWord; at: { start: number; end: number } } => !!h.at)
    .sort((a, b) => a.at.start - b.at.start);
  return paragraphs.map((p, i) => {
    const s = starts[i];
    const out: Piece[] = [];
    let cur = 0;
    for (const h of hits) {
      const a = h.at.start - s;
      const b = h.at.end - s;
      if (a < cur || a < 0 || b > p.length) continue; // друг абзац или застъпване
      if (a > cur) out.push({ text: p.slice(cur, a) });
      out.push({ text: p.slice(a, b), word: h.w });
      cur = b;
    }
    if (cur < p.length) out.push({ text: p.slice(cur) });
    return out;
  });
}

const LETTERS = ["A", "B", "C", "D"];

export function ReadingSession({ reading }: { reading: ReadingView }) {
  const { questions, words } = reading;
  const [phase, setPhase] = useState<Phase>("read");
  const [peeked, setPeeked] = useState<string[]>([]);
  const [open, setOpen] = useState<ReadingWord | null>(null);
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showText, setShowText] = useState(false);
  const [reported, setReported] = useState<number[]>([]);
  const [result, setResult] = useState<Completion | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const startedAt = useRef(Date.now());
  const sent = useRef(false);
  const segs = useMemo(() => pieces(reading.paragraphs, words), [reading.paragraphs, words]);

  function tap(w: ReadingWord) {
    setPeeked((p) => (p.includes(w.itemId) ? p : [...p, w.itemId]));
    setOpen((cur) => (cur?.itemId === w.itemId ? null : w));
  }

  function pick(i: number) {
    if (chosen !== null) return;
    setChosen(i);
    setAnswers((a) => {
      const n = [...a];
      n[qi] = i;
      return n;
    });
  }

  function next() {
    if (qi + 1 < questions.length) {
      setQi(qi + 1);
      setChosen(null);
      setShowText(false);
    } else setPhase("result");
  }

  const localScore = answers.filter((a, i) => a === questions[i].answer).length;

  // при край: записваме резултата и думите като преглед (веднъж)
  useEffect(() => {
    if (phase !== "result" || sent.current) return;
    sent.current = true;
    completeReadingAction({ id: reading.id, answers: questions.map((_, i) => answers[i] ?? -1), peeked, durationMs: Date.now() - startedAt.current }).then((r) => {
      if (r.ok) setResult(r.result);
      else setSaveFailed(true);
    });
  }, [phase, reading.id, questions, answers, peeked]);

  const q = questions[qi];
  const total = questions.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/" aria-label="Затвори" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconClose />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
          {phase === "read" ? "Текст" : phase === "quiz" ? `Въпрос ${qi + 1} от ${total}` : "Резултат"}
        </p>
      </header>

      {phase === "read" && (
        <main className="flex-1 px-5 pb-40 pt-4">
          <h1 className="read text-[28px] font-semibold leading-tight tracking-tight">{reading.title}</h1>
          <p className="mt-2 text-sm text-ink-2">Прочети го. Думите с вълничка са от твоя речник: докосни ги само ако не си спомняш превода.</p>
          <div className="read mt-6 text-[19px] text-ink" style={{ lineHeight: 1.85 }}>
            {segs.map((ps, i) => (
              <p key={i} className="mb-5">
                {ps.map((x, k) =>
                  x.word ? (
                    <button key={k} type="button" className="mark cursor-pointer rounded px-[1px] text-left align-baseline" data-on="true" onClick={() => tap(x.word!)}>
                      {x.text}
                    </button>
                  ) : (
                    <span key={k}>{x.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg px-5 pt-3" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
            <div className="mx-auto max-w-xl">
              <button type="button" className="btn btn-primary w-full" onClick={() => { setOpen(null); setPhase("quiz"); }}>
                Към въпросите
              </button>
            </div>
          </div>
          {open && (
            <div role="dialog" aria-label={`Превод на „${open.target}“`} className="sheet-up fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
              <div className="mx-auto max-w-xl px-5 pb-1 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="read text-[26px] font-medium leading-tight">{open.target}</p>
                  <div className="-mr-2 flex shrink-0 items-center">
                    <SpeakButton text={open.target} />
                    <button type="button" aria-label="Затвори" className="grid h-10 w-10 place-items-center rounded-full text-ink-2 active:bg-surface" onClick={() => setOpen(null)}>
                      <IconClose width={20} height={20} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[22px] font-medium leading-snug">{open.translationBg}</p>
                {open.translationAltBg && <p className="mt-1 text-ink-2">Още: {open.translationAltBg}</p>}
                {open.meaningBg && <p className="mt-2 text-[15px] leading-snug text-ink-2">{open.meaningBg}</p>}
                <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => setOpen(null)}>
                  Продължавам да чета
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {phase === "quiz" && q && (
        <main className="flex flex-1 flex-col px-5 pb-6 pt-4" key={qi}>
          <div className="relative h-[6px]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={qi} aria-label="Напредък във въпросите">
            <div className="absolute inset-0 top-[2px] h-[2px] rounded bg-line" />
            <div className="wave-line wave-progress absolute inset-0" style={{ clipPath: `inset(0 ${100 - Math.round(((qi + (chosen !== null ? 1 : 0)) / total) * 100)}% 0 0)` }} />
          </div>
          <p className="read mt-6 text-[22px] font-medium leading-snug">{q.q}</p>
          <div className="mt-5 grid gap-2" role="group" aria-label="Варианти">
            {q.options.map((o, i) => {
              const right = i === q.answer;
              const mine = chosen === i;
              const locked = chosen !== null;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={locked}
                  onClick={() => pick(i)}
                  className="flex min-h-14 items-start gap-3 rounded-[var(--radius-m)] border-[1.5px] px-4 py-3 text-left text-[17px] leading-snug transition-colors active:bg-surface-2"
                  style={{
                    borderColor: locked && right ? "var(--ok)" : mine ? "var(--accent)" : "var(--line)",
                    background: locked && right ? "var(--ok-tint)" : "var(--surface)",
                    opacity: locked && !right && !mine ? 0.55 : 1,
                  }}
                >
                  <span className="mt-[1px] w-5 shrink-0 text-sm font-semibold text-ink-3">{LETTERS[i]}</span>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>

          {chosen !== null && (
            <div className="enter mt-4 rounded-[var(--radius-m)] px-4 py-3" style={{ background: chosen === q.answer ? "var(--ok-tint)" : "var(--surface)" }} role="status">
              <p className="flex items-center gap-2 font-semibold" style={{ color: chosen === q.answer ? "var(--ok)" : "var(--ink)" }}>
                {chosen === q.answer ? (
                  <>
                    <IconCheck width={20} height={20} />
                    Вярно
                  </>
                ) : (
                  <>Не е точно. Верният отговор е {LETTERS[q.answer]}.</>
                )}
              </p>
              <p className="mt-2 text-[15px] leading-snug">{q.whyBg}</p>
              <p className="read mt-2 text-[15px] italic leading-snug text-ink-2">В текста: „{q.evidence}“</p>
              {!reported.includes(qi) ? (
                <button
                  type="button"
                  className="mt-2 text-[14px] text-ink-3 underline underline-offset-4"
                  onClick={() => {
                    setReported((r) => [...r, qi]);
                    void reportQuestionAction(reading.id, qi);
                  }}
                >
                  Грешка във въпроса
                </button>
              ) : (
                <p className="mt-2 text-[14px] text-ink-3">Отбелязано, благодаря.</p>
              )}
            </div>
          )}

          <div className="mt-4">
            <button type="button" className="text-[15px] text-ink-2 underline underline-offset-4" onClick={() => setShowText((s) => !s)}>
              {showText ? "Скрий текста" : "Покажи текста"}
            </button>
            {showText && (
              <div className="read enter mt-3 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[16px] leading-relaxed">
                {reading.paragraphs.map((p, i) => (
                  <p key={i} className="mb-3 last:mb-0">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto pt-6" style={{ paddingBottom: "max(var(--safe-bottom), 8px)" }}>
            <button type="button" className="btn btn-primary w-full" onClick={next} disabled={chosen === null}>
              {qi + 1 < total ? "Следващ въпрос" : "Виж резултата"}
            </button>
          </div>
        </main>
      )}

      {phase === "result" && (
        <main className="flex flex-1 flex-col px-5 pb-6 pt-6">
          <div className="enter">
            <p className="text-sm text-ink-2">Твоят резултат</p>
            <h1 className="mt-1 text-[56px] font-semibold leading-none tracking-tight tabular-nums">
              {result?.score ?? localScore}
              <span className="text-[28px] text-ink-3"> / {total}</span>
            </h1>
            <span className="wave-line wave-draw mt-3 block w-24" />
            <p className="mt-6 text-[17px] leading-snug">
              {(() => {
                const rec = result?.recognized ?? words.length - peeked.length;
                return (
                  <>
                    Думите ти: разпозна <span className="font-semibold tabular-nums">{rec}</span> от {words.length} без да гледаш превода.
                  </>
                );
              })()}
            </p>
            {result && !result.alreadyDone && <p className="mt-2 text-[15px] text-ink-2">Тези думи вече се броят за преговор. Следващият път ще ги видиш по график.</p>}
            {saveFailed && <p className="mt-2 text-[15px] text-ink-2">Не успях да запиша преговора на думите. Резултатът горе е верен.</p>}
          </div>

          {(result?.peeked ?? words.filter((w) => peeked.includes(w.itemId))).length > 0 && (
            <section className="mt-8" aria-labelledby="again">
              <h2 id="again" className="text-base font-semibold">За още един поглед</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {(result?.peeked ?? words.filter((w) => peeked.includes(w.itemId))).map((w) => (
                  <li key={w.itemId} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="read text-[19px] font-medium">{w.target}</span>
                    <span className="text-right text-ink-2">{w.translationBg}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-8">
            <a href="/reading" className="btn btn-secondary w-full">Още един текст</a>
            <Link href="/" className="btn btn-primary w-full">Към началото</Link>
          </div>
        </main>
      )}
    </div>
  );
}

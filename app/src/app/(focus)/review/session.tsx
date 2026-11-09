"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { judge, type Verdict } from "@/core/srs/answer";
import { isFast, ratingFromResult } from "@/core/srs/scheduler";
import { enqueue, flushOutbox, type OutboxItem } from "@/core/offline/outbox";
import { IconCheck, IconClose, IconEye, IconSpeaker } from "@/design/icons";
import type { Mode, QueueItem } from "@/modules/review/service";
import { posLabel } from "@/modules/vocab/pos";
import { submitReviewAction } from "./actions";
import { keepFocus } from "@/design/keep-focus";

const modeLabel = { recognize: "Помниш ли думата?", type_from_bg: "Как е на английски?", cloze: "Допълни думата", choice: "Избери правилната дума", listen: "Чуй и напиши" } as const;
const send = (i: OutboxItem) => submitReviewAction(i);

/** Колко други карти минават, преди грешната или новата дума да се върне. */
const GAP = 3;
type Entry = { item: QueueItem; stage: "intro" | "ask"; retry: boolean };
const insertAt = (q: Entry[], e: Entry) => [...q.slice(0, GAP), e, ...q.slice(GAP)];
const lettersOf = (t: string) => t.replace(/\s/g, "").length;

export function ReviewSession({ items, practice = false }: { items: QueueItem[]; practice?: boolean }) {
  const [queue, setQueue] = useState<Entry[]>(() => items.map((item) => ({ item, stage: item.intro ? "intro" : "ask", retry: false })));
  const [done, setDone] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [asked, setAsked] = useState(0);
  const [learned, setLearned] = useState(0);
  const [missed, setMissed] = useState<{ target: string; tr: string }[]>([]);
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Exclude<Verdict, "empty"> | null>(null);
  const [overridden, setOverridden] = useState(false);
  const [hint, setHint] = useState(false);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const total = items.length;
  const entry = queue[0];
  const card = entry?.item;

  useEffect(() => {
    flushOutbox(send);
    const on = () => flushOutbox(send);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [card?.cardId, entry?.stage, entry?.retry]);

  const [canSpeak, setCanSpeak] = useState(true);
  useEffect(() => setCanSpeak("speechSynthesis" in window), []);
  /** Режимът, който наистина се показва: без говор слушането става писане, без изречение – писане. */
  const mode: Mode = !card
    ? "type_from_bg"
    : card.mode === "choice" && card.options
      ? "choice"
      : card.mode === "listen" && canSpeak
        ? "listen"
        : card.mode === "cloze" && card.cloze
          ? "cloze"
          : "type_from_bg";

  const finishedAll = !card;
  const pct = Math.round((done / total) * 100);

  /** Свободното упражнение не променя графика: нищо не се записва. */
  function record(item: QueueItem, rating: 1 | 2 | 3 | 4, correct: boolean, typed: string | null) {
    if (practice) return;
    enqueue({
      logId: crypto.randomUUID(),
      cardId: item.cardId,
      mode,
      rating,
      correct,
      typedAnswer: typed,
      durationMs: Math.min(Date.now() - startedAt.current, 3_600_000),
      reviewedAt: new Date().toISOString(),
    });
    flushOutbox(send);
  }

  function resetInput() {
    setValue("");
    setVerdict(null);
    setOverridden(false);
    setHint(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  /** Запознанството свърши: думата се връща като въпрос след няколко други карти. */
  function understood() {
    setLearned((n) => n + 1);
    setQueue((q) => insertAt(q.slice(1), { item: q[0].item, stage: "ask", retry: false }));
    resetInput();
  }

  function check() {
    const r = judge(value, card.answers);
    if (r.verdict === "empty") return;
    setVerdict(r.verdict);
    if (r.verdict === "wrong") return; // записва се при „Следваща“, за да може да се каже „Бях прав“
    if (!entry.retry) {
      const fast = !card.isNew && isFast(Date.now() - startedAt.current, lettersOf(card.phrase ?? card.lemma));
      record(card, ratingFromResult({ verdict: r.verdict, hintUsed: hint, fast }), true, value);
      setAsked((n) => n + 1);
      setFirstTry((n) => n + 1);
    }
  }

  /** Избор от отговори: оценката е веднага; грешният се записва при „Следваща“. */
  function pick(opt: string) {
    if (verdict) return;
    setValue(opt);
    const ok = card.answers.some((a) => a.toLowerCase() === opt.toLowerCase());
    setVerdict(ok ? "correct" : "wrong");
    if (ok && !entry.retry) {
      record(card, 3, true, opt);
      setAsked((n) => n + 1);
      setFirstTry((n) => n + 1);
    }
  }

  /** „Бях прав“: проверката е сгрешила; оценката е „Трудно“, не „Грешка“. */
  function iWasRight() {
    setOverridden(true);
    setVerdict("correct");
    if (!entry.retry) {
      record(card, 2, true, value);
      setAsked((n) => n + 1);
      setFirstTry((n) => n + 1);
    }
  }

  function advance() {
    const wrong = verdict === "wrong" && !overridden;
    if (wrong && !entry.retry) {
      // само първият опит стига до графика; повторението е за запомняне
      record(card, 1, false, value);
      setAsked((n) => n + 1);
      setMissed((m) => [...m, { target: card.phrase ?? card.lemma, tr: card.translationBg }]);
      setQueue((q) => insertAt(q.slice(1), { item: q[0].item, stage: "ask", retry: true }));
    } else {
      setDone((d) => d + 1);
      setQueue((q) => q.slice(1));
    }
    resetInput();
  }

  useEffect(() => {
    if (mode === "listen" && entry?.stage === "ask" && "speechSynthesis" in window) {
      const t = setTimeout(speak, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.cardId, entry?.stage, entry?.retry, mode]);

  function speak() {
    if (!card || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(card.phrase ?? card.lemma);
    u.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  const target = card ? (card.phrase ?? card.lemma) : "";
  const wave = useMemo(() => ({ clipPath: `inset(0 ${100 - pct}% 0 0)` }), [pct]);

  if (finishedAll) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
        <div className="mt-12">
          <h1 className="text-3xl font-semibold tracking-tight">
            {practice ? "Упражнението е готово." : "Готово."}
            <span className="wave-line mt-2 block w-24" />
          </h1>
          {asked > 0 && (
            <p className="mt-6 text-lg">
              Верни от първия опит: <span className="font-semibold tabular-nums">{firstTry}</span> от {asked}.
            </p>
          )}
          {learned > 0 && <p className="mt-2 text-ink-2">Нови думи днес: {learned}.</p>}
          <p className="mt-2 text-ink-2">{practice ? "Графикът не е променен." : "Следващият преговор на тези думи е по график."}</p>
          {missed.length > 0 && (
            <section className="mt-8" aria-labelledby="missed">
              <h2 id="missed" className="text-base font-semibold">За още един поглед</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {missed.map((m) => (
                  <li key={m.target} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="read text-[19px] font-medium">{m.target}</span>
                    <span className="text-ink-2">{m.tr}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="mb-8 mt-auto flex flex-col gap-2 pt-8">
          {!practice && <a href="/review?more=10" className="btn btn-secondary w-full">Още 10 нови думи</a>}
          <a href="/review?practice=1" className="btn btn-secondary w-full">Упражнение: най-слабите думи</a>
          <Link href="/" className="btn btn-primary w-full">Към началото</Link>
        </div>
      </div>
    );
  }

  const locked = verdict !== null;
  const wrong = verdict === "wrong";
  const intro = entry.stage === "intro";
  const clozeText = card.cloze;
  const label = intro ? "Нова дума" : entry.retry ? "Още веднъж" : modeLabel[mode];

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/" aria-label="Затвори преговора" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconClose />
        </Link>
        <div className="relative h-[6px] flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Напредък в преговора">
          <div className="absolute inset-0 top-[2px] h-[2px] rounded bg-line" />
          <div className="wave-line wave-progress absolute inset-0" style={wave} />
        </div>
        <p className="w-14 shrink-0 pr-3 text-right text-sm tabular-nums text-ink-2">
          {Math.min(done + 1, total)} / {total}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-5 pt-8" key={`${card.cardId}-${entry.stage}-${entry.retry}-${done}`}>
        <p className="text-sm text-ink-2">
          {label}
          {card.pos ? ` · ${posLabel(card.pos)}` : ""}
          {practice ? " · упражнение" : ""}
        </p>

        {intro && (
          <>
            <p className="read mt-4 text-[38px] font-medium leading-tight">{target}</p>
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-2xl font-medium">{card.translationBg}</p>
              {card.translationAltBg && <p className="mt-1 text-ink-2">{card.translationAltBg}</p>}
              {card.meaningBg && <p className="mt-3 text-ink-2">{card.meaningBg}</p>}
              {(card.sentence || card.exampleEn) && <p className="read mt-4 text-[18px] italic leading-snug text-ink-2">{card.sentence ?? card.exampleEn}</p>}
            </div>
            <p className="mt-6 text-[15px] text-ink-3">Прочети я и я чуй. След няколко думи ще те попитам за нея.</p>
          </>
        )}

        {!intro && mode === "cloze" && (
          <>
            <p className="read mt-4 text-[24px] leading-[1.5] text-ink">
              {(clozeText ?? "").split("___").map((part, k, arr) => (
                <span key={k}>
                  {part}
                  {k < arr.length - 1 &&
                    (locked ? (
                      <span className="mark px-1 font-medium" data-on="true">
                        {card.surface ?? target}
                      </span>
                    ) : (
                      <span className="inline-block w-24 border-b-2 border-ink-3 align-baseline">&nbsp;</span>
                    ))}
                </span>
              ))}
            </p>
            <p className="mt-4 text-ink-2">Значение: {card.translationBg}</p>
          </>
        )}

        {!intro && mode === "choice" && (
          <>
            <p className="read mt-4 text-[34px] font-medium leading-tight">{card.translationBg}</p>
            {card.meaningBg && <p className="mt-3 text-ink-2">{card.meaningBg}</p>}
            <div className="mt-8 grid gap-2" role="group" aria-label="Варианти">
              {card.options!.map((o) => {
                const isRight = card.answers.some((a) => a.toLowerCase() === o.toLowerCase());
                const chosen = locked && value === o;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={locked}
                    onClick={() => pick(o)}
                    className="read min-h-14 rounded-[var(--radius-m)] border-[1.5px] px-4 text-left text-[20px] transition-colors active:bg-surface-2"
                    style={{
                      borderColor: locked && isRight ? "var(--ok)" : chosen ? "var(--accent)" : "var(--line)",
                      background: locked && isRight ? "var(--ok-tint)" : "var(--surface)",
                      opacity: locked && !isRight && !chosen ? 0.55 : 1,
                    }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!intro && mode === "listen" && (
          <div className="mt-6">
            <button type="button" onClick={speak} className="btn btn-secondary !min-h-16 w-full text-[18px]">
              <IconSpeaker width={26} height={26} />
              Чуй думата
            </button>
            {locked && (
              <>
                <p className="mt-5 text-ink-2">Значение: {card.translationBg}</p>
                {card.exampleEn && <p className="read mt-3 text-[17px] italic leading-snug text-ink-2">{card.exampleEn}</p>}
              </>
            )}
          </div>
        )}

        {!intro && mode === "type_from_bg" && (
          <>
            <p className="read mt-4 text-[34px] font-medium leading-tight">{card.translationBg}</p>
            {card.meaningBg && <p className="mt-3 text-ink-2">{card.meaningBg}</p>}
            {locked && card.exampleEn && <p className="read mt-5 text-[17px] italic leading-snug text-ink-2">{card.exampleEn}</p>}
          </>
        )}

        {!intro && mode !== "choice" && (
          <div className={mode === "listen" ? "mt-5" : "mt-8"}>
            <label htmlFor="answer" className="sr-only">
              Твоят отговор
            </label>
            <input
              id="answer"
              ref={inputRef}
              className="field"
              style={
                verdict === "correct" || verdict === "almost"
                  ? { borderColor: "var(--ok)", background: "var(--ok-tint)" }
                  : wrong
                    ? { borderColor: "var(--line-strong)" }
                    : undefined
              }
              value={value}
              readOnly={locked}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (locked) advance();
                else check();
              }}
              placeholder={hint ? `${target[0]}… (${lettersOf(target)} букви)` : "Напиши отговора"}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint={locked ? "next" : "done"}
              autoFocus
            />
          </div>
        )}

        {locked && (
          <div className="enter mt-4 rounded-[var(--radius-m)] px-4 py-3" style={{ background: wrong ? "var(--surface)" : "var(--ok-tint)" }} role="status">
            <p className="flex items-center gap-2 font-semibold" style={{ color: wrong ? "var(--ink)" : "var(--ok)" }}>
              {wrong ? (
                "Не е точно"
              ) : (
                <>
                  <IconCheck width={20} height={20} />
                  {verdict === "almost" ? "Почти" : "Вярно"}
                </>
              )}
            </p>
            {verdict !== "correct" && (
              <p className="mt-1 text-ink-2">
                {verdict === "almost" ? "Пише се " : "Правилният отговор е "}
                <span className="read text-[18px] font-semibold text-ink">{target}</span>
              </p>
            )}
            {wrong && !entry.retry && <p className="mt-1 text-[15px] text-ink-3">Ще те попитам пак след малко.</p>}
            {wrong && mode !== "choice" && (
              <button type="button" className="mt-2 text-[15px] text-ink-2 underline underline-offset-4" onMouseDown={keepFocus} onClick={iWasRight}>
                Бях прав
              </button>
            )}
          </div>
        )}

        <div className="mt-auto" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
          <div className="flex items-center gap-2 pb-3 pt-6">
            {!intro && mode !== "choice" && (
              <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onMouseDown={keepFocus} onClick={() => setHint(true)} disabled={locked || hint}>
                <IconEye width={20} height={20} />
                Подсказка
              </button>
            )}
            {(intro || locked) && (
              <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onClick={speak}>
                <IconSpeaker width={20} height={20} />
                Чуй
              </button>
            )}
          </div>

          {intro ? (
            <button type="button" className="btn btn-primary w-full" onClick={understood}>
              Разбрах
            </button>
          ) : locked ? (
            <button type="button" className="btn btn-primary w-full" onMouseDown={keepFocus} onClick={advance}>
              Следваща
            </button>
          ) : mode === "choice" ? (
            <p className="py-3 text-center text-[15px] text-ink-3">Докосни отговора</p>
          ) : (
            <button type="button" className="btn btn-primary w-full" onMouseDown={keepFocus} onClick={check} disabled={!value.trim()}>
              Провери
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

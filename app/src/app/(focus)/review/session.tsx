"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { judge, type Verdict } from "@/core/srs/answer";
import { ratingFromResult } from "@/core/srs/scheduler";
import { enqueue, flushOutbox, type OutboxItem } from "@/core/offline/outbox";
import { IconCheck, IconClose, IconEye, IconSpeaker } from "@/design/icons";
import type { QueueItem } from "@/modules/review/service";
import { posLabel } from "@/modules/vocab/pos";
import { submitReviewAction } from "./actions";
import { keepFocus } from "@/design/keep-focus";

const modeLabel = { recognize: "Помниш ли думата?", type_from_bg: "Как е на английски?", cloze: "Допълни думата" } as const;
const send = (i: OutboxItem) => submitReviewAction(i);

export function ReviewSession({ items }: { items: QueueItem[] }) {
  const [queue, setQueue] = useState(items);
  const [done, setDone] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Exclude<Verdict, "empty"> | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const total = items.length;
  const card = queue[0];

  useEffect(() => {
    flushOutbox(send);
    const on = () => flushOutbox(send);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [card?.cardId, queue.length]);

  const finishedAll = !card;
  const pct = Math.round((done / total) * 100);

  function record(item: QueueItem, rating: 1 | 2 | 3, correct: boolean, typed: string | null) {
    enqueue({
      logId: crypto.randomUUID(),
      cardId: item.cardId,
      mode: item.mode,
      rating,
      correct,
      typedAnswer: typed,
      durationMs: Math.min(Date.now() - startedAt.current, 3_600_000),
      reviewedAt: new Date().toISOString(),
    });
    flushOutbox(send);
  }

  function advance(wasWrong: boolean) {
    const cur = queue[0];
    const again = wasWrong && !retried.has(cur.cardId);
    if (again) setRetried((s) => new Set(s).add(cur.cardId));
    else setDone((d) => d + 1);
    setQueue((q) => (again ? [...q.slice(1), cur] : q.slice(1)));
    setValue("");
    setVerdict(null);
    setRevealed(false);
    setHint(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function check() {
    const r = judge(value, card.answers);
    if (r.verdict === "empty") return;
    setVerdict(r.verdict);
    record(card, ratingFromResult({ verdict: r.verdict, hintUsed: hint }), r.verdict !== "wrong", value);
    if (r.verdict !== "wrong" && !retried.has(card.cardId)) setFirstTry((n) => n + 1);
  }

  function selfRate(knew: boolean) {
    record(card, knew ? 3 : 1, knew, null);
    if (knew && !retried.has(card.cardId)) setFirstTry((n) => n + 1);
    advance(!knew);
  }

  function speak() {
    if (!card || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(card.phrase ?? card.lemma);
    u.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  const target = card ? (card.phrase ?? card.lemma) : "";
  const wave = useMemo(() => ({ clipPath: `inset(0 ${100 - pct}% 0 0)`, transition: "clip-path .35s var(--ease-out)" }), [pct]);

  if (finishedAll) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
        <div className="mt-16">
          <h1 className="text-3xl font-semibold tracking-tight">
            Готово.
            <span className="wave-line mt-2 block w-24" />
          </h1>
          <p className="mt-6 text-lg">
            Верни от първия опит: <span className="font-semibold tabular-nums">{firstTry}</span> от {total}.
          </p>
          <p className="mt-2 text-ink-2">Следващият преговор на тези думи е по график.</p>
        </div>
        <Link href="/" className="btn btn-primary mb-8 mt-auto w-full">
          Към началото
        </Link>
      </div>
    );
  }

  const locked = verdict !== null;
  const wrong = verdict === "wrong";

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/" aria-label="Затвори преговора" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconClose />
        </Link>
        <div className="relative h-[6px] flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Напредък в преговора">
          <div className="absolute inset-0 top-[2px] h-[2px] rounded bg-line" />
          <div className="wave-line absolute inset-0" style={wave} />
        </div>
        <p className="w-14 shrink-0 pr-3 text-right text-sm tabular-nums text-ink-2">
          {Math.min(done + 1, total)} / {total}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-5 pt-8" key={card.cardId + queue.length}>
        <p className="text-sm text-ink-2">
          {modeLabel[card.mode]}
          {card.pos ? ` · ${posLabel(card.pos)}` : ""}
          {card.isNew ? " · нова" : ""}
        </p>

        {card.mode === "recognize" && (
          <>
            <p className="read mt-4 text-[38px] font-medium leading-tight">{target}</p>
            {card.sentence && (
              <p className="read mt-4 text-[19px] italic leading-snug text-ink-2">{card.sentence}</p>
            )}
            {revealed && (
              <div className="mt-8 border-t border-line pt-5">
                <p className="text-2xl font-medium">{card.translationBg}</p>
                {card.translationAltBg && <p className="mt-1 text-ink-2">{card.translationAltBg}</p>}
                {card.meaningBg && <p className="mt-3 text-ink-2">{card.meaningBg}</p>}
                {card.exampleEn && <p className="read mt-3 text-[17px] italic text-ink-2">{card.exampleEn}</p>}
              </div>
            )}
          </>
        )}

        {card.mode === "cloze" && (
          <>
            <p className="read mt-4 text-[24px] leading-[1.5] text-ink">
              {(card.sentence ?? "").split("___").map((part, k, arr) => (
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

        {card.mode === "type_from_bg" && (
          <>
            <p className="read mt-4 text-[34px] font-medium leading-tight">{card.translationBg}</p>
            {card.meaningBg && <p className="mt-3 text-ink-2">{card.meaningBg}</p>}
            {locked && card.exampleEn && <p className="read mt-5 text-[17px] italic leading-snug text-ink-2">{card.exampleEn}</p>}
          </>
        )}

        {card.mode !== "recognize" && (
          <div className="mt-8">
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
                if (locked) advance(wrong);
                else check();
              }}
              placeholder={hint ? `${target.slice(0, Math.min(2, Math.ceil(target.length / 3)))}…` : "Напиши отговора"}
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
          <div className="mt-4 rounded-[var(--radius-m)] px-4 py-3" style={{ background: wrong ? "var(--surface)" : "var(--ok-tint)" }} role="status">
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
          </div>
        )}

        <div className="mt-auto" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
          <div className="flex items-center gap-2 pb-3 pt-6">
            {card.mode !== "recognize" && (
              <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onMouseDown={keepFocus} onClick={() => setHint(true)} disabled={locked || hint}>
                <IconEye width={20} height={20} />
                Подсказка
              </button>
            )}
            <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onClick={speak}>
              <IconSpeaker width={20} height={20} />
              Чуй
            </button>
          </div>

          {card.mode === "recognize" ? (
            revealed ? (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn btn-secondary" onClick={() => selfRate(false)}>
                  Не я знаех
                </button>
                <button type="button" className="btn btn-primary" onClick={() => selfRate(true)}>
                  Знаех я
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary w-full" onClick={() => setRevealed(true)}>
                Покажи превода
              </button>
            )
          ) : locked ? (
            <button type="button" className="btn btn-primary w-full" onMouseDown={keepFocus} onClick={() => advance(wrong)}>
              Следваща
            </button>
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

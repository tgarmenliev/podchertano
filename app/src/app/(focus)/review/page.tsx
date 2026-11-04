"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { IconCheck, IconClose, IconEye, IconSpeaker } from "@/design/icons";

type Card =
  | { kind: "cloze"; sentence: string; answer: string; hintBg: string; pos: string; example?: string }
  | { kind: "translate"; promptBg: string; answer: string; pos: string; example: string };

/* Примерни карти за макета. Истинските идват от речника и FSRS. */
const cards: Card[] = [
  {
    kind: "cloze",
    sentence: "Last summer my cousin decided to ___ his job in the city and move to a small village near the sea.",
    answer: "give up",
    hintBg: "отказвам се от",
    pos: "фразов глагол",
  },
  {
    kind: "translate",
    promptBg: "убеждавам",
    answer: "persuade",
    pos: "глагол",
    example: "After years of persuading them, she finally enrolled in a flying school.",
  },
  {
    kind: "cloze",
    sentence: "The locals were ___ of him, because strangers rarely stayed in the village for more than a week.",
    answer: "suspicious",
    hintBg: "подозрителен",
    pos: "прилагателно",
  },
];

type Status = "idle" | "correct" | "almost" | "wrong";

const clean = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,!?;:]+$/g, "");
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function judge(input: string, answer: string): Status {
  const a = clean(input);
  if (!a) return "idle";
  if (a === answer) return "correct";
  if (answer.length >= 5 && distance(a, answer) === 1) return "almost";
  return "wrong";
}

export default function Review() {
  const [i, setI] = useState(0);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const done = i >= cards.length;
  const card = cards[Math.min(i, cards.length - 1)];
  const pct = Math.round(((done ? cards.length : i) / cards.length) * 100);

  const check = () => {
    const s = judge(value, card.answer);
    if (s === "idle") return;
    setStatus(s);
    if (s === "correct" || s === "almost") setScore((x) => x + 1);
  };
  const next = () => {
    setI((x) => x + 1);
    setValue("");
    setStatus("idle");
    setHint(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(card.answer);
    u.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
        <div className="mt-16">
          <h1 className="text-3xl font-semibold tracking-tight">
            Готово.
            <span className="wave-line mt-2 block w-24" />
          </h1>
          <p className="mt-6 text-lg">
            Верни отговори: <span className="font-semibold tabular-nums">{score}</span> от {cards.length}.
          </p>
          <p className="mt-2 text-ink-2">Следващият преговор на тези думи е по график.</p>
        </div>
        <Link href="/" className="btn btn-primary mt-auto mb-8 w-full">
          Към началото
        </Link>
      </div>
    );
  }

  const locked = status !== "idle";
  const first = card.answer[0];

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/" aria-label="Затвори преговора" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconClose />
        </Link>
        <div
          className="relative h-[6px] flex-1"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={cards.length}
          aria-valuenow={i}
          aria-label="Напредък в преговора"
        >
          <div className="absolute inset-0 top-[2px] h-[2px] rounded bg-line" />
          <div className="wave-line absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)`, transition: "clip-path .35s var(--ease-out)" }} />
        </div>
        <p className="w-14 shrink-0 pr-3 text-right text-sm tabular-nums text-ink-2">
          {i + 1} / {cards.length}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-5 pt-8">
        <p className="text-sm text-ink-2">
          {card.kind === "cloze" ? "Допълни думата" : "Как е на английски?"} · {card.pos}
        </p>

        {card.kind === "cloze" ? (
          <>
            <p className="read mt-4 text-[24px] leading-[1.5] text-ink">
              {card.sentence.split("___").map((part, k, arr) => (
                <span key={k}>
                  {part}
                  {k < arr.length - 1 &&
                    (locked ? (
                      <span className="mark px-1 font-medium" data-on="true">
                        {card.answer}
                      </span>
                    ) : (
                      <span className="inline-block w-24 border-b-2 border-ink-3 align-baseline">&nbsp;</span>
                    ))}
                </span>
              ))}
            </p>
            <p className="mt-4 text-ink-2">Значение: {card.hintBg}</p>
          </>
        ) : (
          <>
            <p className="read mt-4 text-[34px] font-medium leading-tight">{card.promptBg}</p>
            {locked && <p className="read mt-5 text-[17px] italic leading-snug text-ink-2">{card.example}</p>}
          </>
        )}

        <div className="mt-8">
          <label htmlFor="answer" className="sr-only">
            Твоят отговор
          </label>
          <input
            id="answer"
            ref={inputRef}
            className="field"
            style={
              status === "correct" || status === "almost"
                ? { borderColor: "var(--ok)", background: "var(--ok-tint)" }
                : status === "wrong"
                  ? { borderColor: "var(--line-strong)" }
                  : undefined
            }
            value={value}
            readOnly={locked}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (locked ? next() : check())}
            placeholder={hint ? `${first}…` : "Напиши отговора"}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint={locked ? "next" : "done"}
            autoFocus
          />
        </div>

        {locked && (
          <div
            className="mt-4 rounded-[var(--radius-m)] px-4 py-3"
            style={{ background: status === "wrong" ? "var(--surface)" : "var(--ok-tint)" }}
            role="status"
          >
            <p className="flex items-center gap-2 font-semibold" style={{ color: status === "wrong" ? "var(--ink)" : "var(--ok)" }}>
              {status === "wrong" ? (
                "Не е точно"
              ) : (
                <>
                  <IconCheck width={20} height={20} />
                  {status === "almost" ? "Почти" : "Вярно"}
                </>
              )}
            </p>
            {status !== "correct" && (
              <p className="mt-1 text-ink-2">
                {status === "almost" ? "Пише се " : "Правилният отговор е "}
                <span className="read text-[18px] font-semibold text-ink">{card.answer}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-auto" style={{ paddingBottom: "max(var(--safe-bottom), 16px)" }}>
          <div className="flex items-center gap-2 pb-3 pt-6">
            <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onClick={() => setHint(true)} disabled={locked || hint}>
              <IconEye width={20} height={20} />
              Подсказка
            </button>
            <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-[15px]" onClick={speak}>
              <IconSpeaker width={20} height={20} />
              Чуй
            </button>
          </div>
          {locked ? (
            <button type="button" className="btn btn-primary w-full" onClick={next}>
              Следваща
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full" onClick={check} disabled={!value.trim()}>
              Провери
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

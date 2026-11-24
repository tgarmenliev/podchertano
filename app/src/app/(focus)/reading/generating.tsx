"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconClose } from "@/design/icons";
import { createReadingAction } from "./actions";

const steps = ["Подбирам думите, които най-много ти трябват", "Пиша текста", "Правя въпросите и проверявам, че са верни"];

/** Чака да се направи текстът (15–25 s), после зарежда страницата отново. */
export function Generating() {
  const router = useRouter();
  const started = useRef(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<{ code: string; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 6000);
    if (!started.current) {
      started.current = true;
      createReadingAction().then((r) => {
        if (r.ok) router.refresh();
        else setErr({ code: r.code, error: r.error });
      });
    }
    return () => clearInterval(t);
  }, [router, attempt]);

  function retry() {
    started.current = false;
    setErr(null);
    setStep(0);
    setAttempt((a) => a + 1);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 8px)", paddingBottom: "max(var(--safe-bottom), 24px)" }}>
      <header className="flex h-11 items-center">
        <Link href="/" aria-label="Затвори" className="-ml-3 grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconClose />
        </Link>
      </header>
      {err ? (
        <>
          <div className="enter mt-16" role="alert">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{err.error}</h1>
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-8">
            {err.code === "no_words" && <Link href="/words/new" className="btn btn-primary w-full">Добави думи</Link>}
            {(err.code === "failed") && <button type="button" className="btn btn-primary w-full" onClick={retry}>Опитай пак</button>}
            <Link href="/" className="btn btn-secondary w-full">Към началото</Link>
          </div>
        </>
      ) : (
        <div className="enter mt-16" role="status" aria-live="polite">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">Правя текст по твои думи…</h1>
          <div className="wave-line wave-loading mt-5 w-28" />
          <ol className="mt-8 space-y-2 text-[15px]">
            {steps.map((s, k) => (
              <li key={s} className={k < step ? "text-ink-2" : k === step ? "font-medium" : "text-ink-3"}>
                {k < step ? "✓ " : ""}
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-[38ch] text-sm text-ink-2">Обикновено отнема около 20 секунди. Текстът е нов, написан само за теб.</p>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { POS, posLabel } from "@/modules/vocab/pos";
import { addWordAction, saveWordAction, type FormState } from "../actions";
import { enrichAction } from "../../scan/actions";
import { SpeakButton } from "@/design/speak";
import { keepFocus } from "@/design/keep-focus";
import type { Enriched } from "@/core/ai/enrich";

type Phase = "input" | "loading" | "result" | "saving";

function ManualForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addWordAction, {});
  const f = "field !text-[18px]";
  const l = "mb-2 block text-sm text-ink-2";
  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="text" className={l}>Дума или израз на английски</label>
        <input id="text" name="text" className={f} required maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" autoFocus />
      </div>
      <div>
        <label htmlFor="translation" className={l}>Превод на български</label>
        <input id="translation" name="translation" className={`${f} !font-[family-name:var(--font-ui)]`} required maxLength={120} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="pos" className={l}>Част на речта (по желание)</label>
        <select id="pos" name="pos" className={`${f} !font-[family-name:var(--font-ui)]`} defaultValue="">
          <option value="">Не знам / пропускам</option>
          {Object.entries(POS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sentence" className={l}>Изречението, в което си я срещнал (по желание)</label>
        <textarea id="sentence" name="sentence" className={`${f} !h-28 !py-3`} maxLength={300} autoCapitalize="none" spellCheck={false} />
        <p className="mt-2 text-sm text-ink-2">С изречение преговорът може да те пита като „допълни думата“.</p>
      </div>
      <div>
        <label htmlFor="surface" className={l}>Как се среща в изречението (ако е различно)</label>
        <input id="surface" name="surface" className={f} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="напр. repaired" />
      </div>
      <div>
        <label htmlFor="meaning" className={l}>Значение с твои думи (по желание)</label>
        <input id="meaning" name="meaning" className={`${f} !font-[family-name:var(--font-ui)]`} maxLength={200} autoComplete="off" />
      </div>
      {state.error && (
        <p role="alert" className="text-[15px]">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={pending}>
        {pending ? "Записваме…" : "Добави в речника"}
      </button>
    </form>
  );
}

/**
 * Една дума или израз: пишеш само нея, AI дава превод, част на речта, обяснение и пример.
 * Можеш да поправиш превода, преди да я добавиш. Без AI (или при грешка) има ръчна форма.
 */
export function NewWordForm({ aiAvailable }: { aiAvailable: boolean }) {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [sentence, setSentence] = useState("");
  const [withSentence, setWithSentence] = useState(false);
  const [res, setRes] = useState<Enriched | null>(null);
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(!aiAvailable);
  const [added, setAdded] = useState<{ word: string; id: string; again: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const l = "mb-2 block text-sm text-ink-2";

  if (manual) {
    return (
      <>
        {aiAvailable && (
          <button type="button" className="mb-5 text-[15px] text-ink-2 underline underline-offset-4" onClick={() => setManual(false)}>
            Остави AI да я попълни
          </button>
        )}
        <ManualForm />
      </>
    );
  }

  async function translate(e?: React.FormEvent) {
    e?.preventDefault();
    const w = text.trim();
    if (!w) return;
    setError(null);
    setAdded(null);
    setPhase("loading");
    const r = await enrichAction([{ id: 0, surface: w, sentence: withSentence ? sentence.trim() : "" }]);
    if (r.ok && r.items[0]) {
      setRes(r.items[0]);
      setTranslation(r.items[0].translation_bg);
      setPhase("result");
    } else {
      setError(r.ok ? "Не получих превод. Опитай пак." : r.error);
      setPhase("input");
    }
  }

  async function save() {
    if (!res || !translation.trim()) return;
    setPhase("saving");
    const r = await saveWordAction({
      lemma: res.lemma,
      translation,
      alt: res.translation_alt_bg,
      meaning: res.meaning_bg,
      example: res.example_en,
      pos: res.pos,
      phrase: res.phrase,
      sentence: withSentence ? sentence.trim() || null : null,
      surface: withSentence ? text.trim() : null,
    });
    if (!r.ok) {
      setError(r.error);
      setPhase("result");
      return;
    }
    setAdded({ word: res.phrase ?? res.lemma, id: r.id, again: !r.created });
    setRes(null);
    setText("");
    setSentence("");
    setWithSentence(false);
    setTranslation("");
    setPhase("input");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const busy = phase === "loading" || phase === "saving";

  return (
    <div>
      {added && (
        <p role="status" className="enter mb-5 rounded-[var(--radius-m)] px-4 py-3 text-[15px]" style={{ background: "var(--ok-tint)", color: "var(--ok)" }}>
          {added.again ? "Вече беше в речника: " : "Добавена: "}
          <span className="read text-[17px] font-semibold">{added.word}</span>{" "}
          <Link href={`/words/${added.id}`} className="ml-1 underline underline-offset-4">
            Виж
          </Link>
        </p>
      )}

      {phase !== "result" && phase !== "saving" ? (
        <form onSubmit={translate} className="space-y-5">
          <div>
            <label htmlFor="text" className={l}>Дума или израз на английски</label>
            <input
              id="text"
              ref={inputRef}
              className="field !text-[20px]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={60}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              disabled={busy}
              placeholder="напр. reckon или give up"
            />
          </div>
          {withSentence ? (
            <div>
              <label htmlFor="sentence" className={l}>Изречението, в което си я срещнал</label>
              <textarea id="sentence" className="field !h-24 !py-3 !text-[17px]" value={sentence} onChange={(e) => setSentence(e.target.value)} maxLength={300} spellCheck={false} disabled={busy} />
              <p className="mt-2 text-sm text-ink-2">С изречение преводът е точно за това значение и преговорът може да те пита „допълни думата“.</p>
            </div>
          ) : (
            <button type="button" className="text-[15px] text-ink-2 underline underline-offset-4" onClick={() => setWithSentence(true)}>
              Добави изречението, в което си я срещнал
            </button>
          )}
          {error && (
            <p role="alert" className="text-[15px]">
              {error}{" "}
              <button type="button" className="underline underline-offset-4" onClick={() => setManual(true)}>
                Попълни ръчно
              </button>
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={busy || !text.trim()}>
            {phase === "loading" ? "Превеждам…" : "Преведи"}
          </button>
          {phase === "loading" && <div role="status" className="wave-line wave-loading w-24" aria-label="Превеждам" />}
          <button type="button" className="block text-[15px] text-ink-2 underline underline-offset-4" onClick={() => setManual(true)}>
            Попълни ръчно
          </button>
        </form>
      ) : (
        res && (
          <div className="enter">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="read text-[34px] font-medium leading-tight">{res.phrase ?? res.lemma}</p>
                {res.pos !== "other" && <p className="mt-1 text-sm text-ink-2">{posLabel(res.pos)}</p>}
              </div>
              <div className="-mr-2 shrink-0">
                <SpeakButton text={res.phrase ?? res.lemma} />
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="tr" className={l}>Превод (можеш да го поправиш)</label>
              <input id="tr" className="field !text-[20px] !font-[family-name:var(--font-ui)]" value={translation} onChange={(e) => setTranslation(e.target.value)} maxLength={120} disabled={phase === "saving"} />
              {res.translation_alt_bg && <p className="mt-2 text-ink-2">Още: {res.translation_alt_bg}</p>}
            </div>

            {res.meaning_bg && (
              <div className="mt-5">
                <p className="text-sm text-ink-2">Какво значи</p>
                <p className="mt-1 text-[16px] leading-snug">{res.meaning_bg}</p>
              </div>
            )}
            {res.example_en && (
              <div className="mt-5">
                <p className="text-sm text-ink-2">Пример</p>
                <p className="read mt-1 text-[18px] italic leading-snug">{res.example_en}</p>
              </div>
            )}
            {withSentence && sentence.trim() && (
              <div className="mt-5">
                <p className="text-sm text-ink-2">Твоето изречение</p>
                <p className="read mt-1 text-[16px] italic leading-snug text-ink-2">{sentence}</p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 text-[15px]">
                {error}
              </p>
            )}
            <div className="mt-8 flex flex-col gap-2">
              <button type="button" className="btn btn-primary w-full" onMouseDown={keepFocus} onClick={save} disabled={phase === "saving" || !translation.trim()}>
                {phase === "saving" ? "Добавям…" : "Добави в речника"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full"
                onClick={() => {
                  setRes(null);
                  setPhase("input");
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                disabled={phase === "saving"}
              >
                Промени думата
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

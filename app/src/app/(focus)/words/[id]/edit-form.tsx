"use client";

import { useActionState } from "react";
import { updateWordAction, type FormState } from "../actions";
import { keepFocus } from "@/design/keep-focus";

type W = { id: string; translationBg: string; translationAltBg: string; meaningBg: string; exampleEn: string; notes: string };

export function EditForm({ word }: { word: W }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateWordAction, {});
  const f = "field !text-[17px] !font-[family-name:var(--font-ui)]";
  const l = "mb-2 block text-sm text-ink-2";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={word.id} />
      <div><label className={l} htmlFor="t">Превод</label><input id="t" name="translation" className={f} defaultValue={word.translationBg} required maxLength={120} /></div>
      <div><label className={l} htmlFor="a">Друг превод</label><input id="a" name="alt" className={f} defaultValue={word.translationAltBg} maxLength={120} /></div>
      <div><label className={l} htmlFor="m">Значение</label><input id="m" name="meaning" className={f} defaultValue={word.meaningBg} maxLength={200} /></div>
      <div><label className={l} htmlFor="e">Пример на английски</label><input id="e" name="example" className={`${f} !font-[family-name:var(--font-read)]`} defaultValue={word.exampleEn} maxLength={300} /></div>
      <div><label className={l} htmlFor="n">Бележка</label><input id="n" name="notes" className={f} defaultValue={word.notes} maxLength={300} /></div>
      {state.error && <p role="alert" className="text-[15px]">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={pending}>{pending ? "Записваме…" : "Запази"}</button>
    </form>
  );
}

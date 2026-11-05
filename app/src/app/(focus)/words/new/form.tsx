"use client";

import { useActionState } from "react";
import { POS } from "@/modules/vocab/pos";
import { addWordAction, type FormState } from "../actions";
import { keepFocus } from "@/design/keep-focus";

export function NewWordForm() {
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

"use client";

import { useState } from "react";
import { authClient } from "@/core/auth/client";
import { keepFocus } from "@/design/keep-focus";

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: "Новата парола трябва да е поне 8 знака." });
    if (next !== again) return setMsg({ ok: false, text: "Двете нови пароли не съвпадат." });
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.status === 429 ? "Твърде много опити. Изчакай минута." : "Сегашната парола не е вярна." });
    setCur("");
    setNext("");
    setAgain("");
    setMsg({ ok: true, text: "Паролата е сменена. На другите устройства ще трябва да влезеш отново." });
  }

  const f = "field !text-[17px] !font-[family-name:var(--font-ui)]";
  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor="cur" className="mb-2 block text-sm text-ink-2">Сегашна парола</label>
        <input id="cur" type="password" className={f} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label htmlFor="next" className="mb-2 block text-sm text-ink-2">Нова парола (поне 8 знака)</label>
        <input id="next" type="password" className={f} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label htmlFor="again" className="mb-2 block text-sm text-ink-2">Нова парола още веднъж</label>
        <input id="again" type="password" className={f} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className="text-[15px]" style={{ color: msg.ok ? "var(--ok)" : "var(--ink)" }}>
          {msg.text}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" onMouseDown={keepFocus} disabled={busy || !cur || !next || !again}>
        {busy ? "Сменяме…" : "Смени паролата"}
      </button>
    </form>
  );
}

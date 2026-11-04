"use client";

import { useState } from "react";
import { authClient } from "@/core/auth/client";

export function LoginForm({ blocked }: { blocked: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(blocked ? "Достъпът на този акаунт е спрян." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.username({ username: username.trim(), password });
    if (error) {
      setBusy(false);
      setError(error.status === 429 ? "Твърде много опити. Изчакай минута и опитай пак." : "Грешно потребителско име или парола.");
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit} className="mt-10 flex flex-1 flex-col">
      <label htmlFor="username" className="mb-2 text-sm text-ink-2">
        Потребителско име
      </label>
      <input
        id="username"
        name="username"
        className="field !text-[18px] !font-[family-name:var(--font-ui)]"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
        required
      />

      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <label htmlFor="password" className="text-sm text-ink-2">
          Парола
        </label>
        <button type="button" className="text-sm text-ink-2 underline underline-offset-4" onClick={() => setShow((s) => !s)}>
          {show ? "Скрий" : "Покажи"}
        </button>
      </div>
      <input
        id="password"
        name="password"
        type={show ? "text" : "password"}
        className="field !text-[18px] !font-[family-name:var(--font-ui)]"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
        aria-invalid={!!error}
        aria-describedby={error ? "login-error" : undefined}
      />

      {error && (
        <p id="login-error" role="alert" className="mt-4 text-[15px]">
          {error}
        </p>
      )}

      <div className="mt-auto pt-10">
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? "Влизаме…" : "Вход"}
        </button>
        <p className="mt-4 text-center text-sm text-ink-2">Акаунтът ти го създава този, който ти е дал достъп. Забравена парола? Поискай нова от него.</p>
      </div>
    </form>
  );
}

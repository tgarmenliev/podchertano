"use client";

import { useActionState } from "react";
import { authClient } from "@/core/auth/client";
import { redeem, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(redeem, {});
  return (
    <form action={action} className="mt-8 flex flex-1 flex-col">
      <label htmlFor="code" className="mb-2 text-sm text-ink-2">
        Код за покана
      </label>
      <input
        id="code"
        name="code"
        className="field uppercase tracking-[0.12em]"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        required
        minLength={6}
        maxLength={40}
        aria-invalid={!!state.error}
        aria-describedby={state.error ? "code-error" : undefined}
        autoFocus
      />
      {state.error && (
        <p id="code-error" role="alert" className="mt-3 text-[15px]">
          {state.error}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-10">
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Проверяваме…" : "Продължи"}
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/login";
          }}
        >
          Изход
        </button>
      </div>
    </form>
  );
}

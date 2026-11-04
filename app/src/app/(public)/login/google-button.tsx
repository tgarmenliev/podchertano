"use client";

import { useState } from "react";
import { authClient } from "@/core/auth/client";

export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login?e=auth" });
        if (res?.error) setBusy(false);
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M21.6 12.23c0-.68-.06-1.19-.19-1.72H12v3.37h5.5c-.11.84-.71 2.1-2.04 2.95l-.02.12 2.96 2.29.2.02c1.88-1.74 2.97-4.3 2.97-7.03Z" />
        <path d="M12 22c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45c-.85.59-1.98 1-3.46 1-2.64 0-4.88-1.74-5.68-4.15l-.12.01-3.08 2.38-.04.11C4.73 19.77 8.08 22 12 22Z" />
        <path d="M6.32 13.98A6.1 6.1 0 0 1 5.99 12c0-.69.12-1.36.32-1.98l-.01-.13-3.12-2.42-.1.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.48l3.25-2.5Z" />
        <path d="M12 5.87c1.87 0 3.13.8 3.85 1.48l2.81-2.74C16.95 3.02 14.7 2 12 2 8.08 2 4.73 4.23 3.07 7.52l3.24 2.5C7.12 7.61 9.36 5.87 12 5.87Z" />
      </svg>
      {busy ? "Отваряме Google…" : "Продължи с Google"}
    </button>
  );
}

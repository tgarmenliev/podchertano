"use client";

import { authClient } from "@/core/auth/client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary w-full"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/login";
      }}
    >
      Изход
    </button>
  );
}

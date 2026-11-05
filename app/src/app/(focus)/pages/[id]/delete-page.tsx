"use client";

import { useFormStatus } from "react-dom";

export function DeletePage() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost w-full" disabled={pending} onClick={(e) => { if (!confirm("Да изтрия ли тази страница и снимката ѝ?")) e.preventDefault(); }}>
      {pending ? "Изтриваме…" : "Изтрий страницата"}
    </button>
  );
}

"use client";

import { useFormStatus } from "react-dom";

export function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-ghost w-full"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("Да изтрия ли тази дума? Преговорът ѝ също ще изчезне.")) e.preventDefault();
      }}
    >
      {pending ? "Изтриваме…" : "Изтрий думата"}
    </button>
  );
}

"use client";

export function DeleteButton() {
  return (
    <button
      type="submit"
      className="btn btn-ghost w-full"
      onClick={(e) => {
        if (!confirm("Да изтрия ли тази дума? Преговорът ѝ също ще изчезне.")) e.preventDefault();
      }}
    >
      Изтрий думата
    </button>
  );
}

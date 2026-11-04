"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const options: { v: Theme; label: string }[] = [
  { v: "system", label: "Като телефона" },
  { v: "light", label: "Светла" },
  { v: "dark", label: "Тъмна" },
];

export function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  function pick(t: Theme) {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = t;
  }

  return (
    <div role="radiogroup" aria-label="Тема" className="mt-3 grid grid-cols-3 gap-1 rounded-[var(--radius-m)] bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={theme === o.v}
          onClick={() => pick(o.v)}
          className="min-h-11 rounded-[9px] px-2 text-[14px] font-medium"
          style={theme === o.v ? { background: "var(--bg)", boxShadow: "0 0 0 1px var(--line-strong)" } : { color: "var(--ink-2)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

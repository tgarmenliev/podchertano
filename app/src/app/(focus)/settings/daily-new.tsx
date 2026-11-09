"use client";

import { useState, useTransition } from "react";
import { setDailyNewAction } from "./actions";

const options = [5, 8, 12, 20];

export function DailyNew({ initial }: { initial: number }) {
  const [n, setN] = useState(initial);
  const [, start] = useTransition();
  function pick(v: number) {
    setN(v);
    start(() => setDailyNewAction(v));
  }
  return (
    <div role="radiogroup" aria-label="Нови думи на ден" className="mt-3 grid grid-cols-4 gap-1 rounded-[var(--radius-m)] bg-surface p-1">
      {options.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={n === v}
          onClick={() => pick(v)}
          className="min-h-11 rounded-[9px] px-2 text-[15px] font-medium tabular-nums"
          style={n === v ? { background: "var(--bg)", boxShadow: "0 0 0 1px var(--line-strong)" } : { color: "var(--ink-2)" }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

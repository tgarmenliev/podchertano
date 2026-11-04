import type { SVGProps } from "react";

/* Един набор линейни икони, 24×24, щрих 1.75: еднакъв речник из цялото приложение. */
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconToday = (p: P) => (
  <svg {...base(p)}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h4" /></svg>
);
export const IconWords = (p: P) => (
  <svg {...base(p)}><path d="M12 6.5c-1.8-1.3-4.2-1.8-7-1.5v12c2.8-.3 5.2.2 7 1.5 1.8-1.3 4.2-1.8 7-1.5V5c-2.8-.3-5.2.2-7 1.5Z" /><path d="M12 6.5v12" /></svg>
);
export const IconProgress = (p: P) => (
  <svg {...base(p)}><path d="M5 20V12M12 20V5M19 20v-5" /></svg>
);
export const IconCamera = (p: P) => (
  <svg {...base(p)}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconBack = (p: P) => (
  <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconSpeaker = (p: P) => (
  <svg {...base(p)}><path d="M5 9.5h3l4-3.5v12l-4-3.5H5Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const IconChevron = (p: P) => (
  <svg {...base(p)}><path d="M9 5l7 7-7 7" /></svg>
);
export const IconEye = (p: P) => (
  <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
);

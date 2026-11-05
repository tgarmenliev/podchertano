"use client";

import { IconSpeaker } from "./icons";

/** Произнася текста с гласа на телефона (безплатно, на устройството). */
export function speak(text: string, lang = "en-GB") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function SpeakButton({ text, label = "Чуй", size = 20 }: { text: string; label?: string; size?: number }) {
  return (
    <button type="button" aria-label={`${label}: ${text}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface" onClick={() => speak(text)}>
      <IconSpeaker width={size} height={size} />
    </button>
  );
}

"use client";

/*
  Опашка за изпращане на преглеждания. Записва в localStorage и изпраща по ред;
  при липса на връзка остава и се опитва пак. Сървърът е идемпотентен по logId.
*/
export type OutboxItem = {
  logId: string;
  cardId: string;
  mode: "recognize" | "type_from_bg" | "cloze" | "choice" | "listen";
  rating: 1 | 2 | 3 | 4;
  correct: boolean;
  typedAnswer: string | null;
  durationMs: number | null;
  reviewedAt: string; // ISO
};

const KEY = "outbox:reviews:v1";
const read = (): OutboxItem[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const write = (items: OutboxItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
};

let flushing = false;
export async function flushOutbox(send: (i: OutboxItem) => Promise<void>) {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const [first] = read();
      if (!first) break;
      try {
        await send(first);
      } catch {
        break; // няма връзка или сървърна грешка: остава за по-късно
      }
      write(read().filter((x) => x.logId !== first.logId));
    }
  } finally {
    flushing = false;
  }
}

export function enqueue(item: OutboxItem) {
  write([...read(), item]);
}
export const pending = () => read().length;

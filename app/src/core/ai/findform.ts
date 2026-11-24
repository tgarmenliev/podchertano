const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Първата поява на формата като цяла дума/израз (без значение на регистъра); null, ако няма. */
export function findForm(body: string, form: string): { start: number; end: number } | null {
  const m = new RegExp(`(?<![A-Za-z'’])${esc(form.trim())}(?![A-Za-z'’])`, "i").exec(body);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** Разбира списък думи: по една на ред или със запетая/точка и запетая. Изразите с интервал остават цели. */
export const MAX_BATCH = 20;

export function parseWordList(text: string): { words: string[]; dropped: number } {
  const seen = new Set<string>();
  const words: string[] = [];
  let dropped = 0;
  for (const raw of text.split(/[\n,;]+/)) {
    const w = raw.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim().replace(/\s+/g, " ");
    if (!w || w.length > 60) continue;
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (words.length >= MAX_BATCH) dropped++;
    else words.push(w);
  }
  return { words, dropped };
}

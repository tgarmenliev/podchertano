/*
  Проверка на написан отговор. Чиста логика, ползва се на клиента и на сървъра.
  Правило: точно съвпадение = вярно; разлика от една буква при дума от 5+ знака = „почти“.
*/
export type Verdict = "correct" | "almost" | "wrong" | "empty";

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:"“”()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** accepted: всички приети форми (напр. формата от текста и основната форма). */
export function judge(input: string, accepted: string[]): { verdict: Verdict; matched?: string } {
  const a = normalize(input);
  if (!a) return { verdict: "empty" };
  const targets = accepted.map(normalize).filter(Boolean);
  const exact = targets.find((t) => t === a);
  if (exact) return { verdict: "correct", matched: exact };
  const near = targets.find((t) => t.length >= 5 && distance(a, t) === 1);
  if (near) return { verdict: "almost", matched: near };
  return { verdict: "wrong" };
}

/*
  Проверка на написан отговор. Чиста логика, ползва се на клиента и на сървъра.
  Правило: съвпадение (без `to`/член отпред, британски = американски правопис) = вярно;
  1 буква разлика при 5+ знака (2 при 9+) или разменени съседни букви = „почти“.
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

/** Разстояние на Дамерау (OSA): размяна на две съседни букви струва 1. */
export function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const PAIRS: [string, string][] = [["grey", "gray"], ["centre", "center"], ["theatre", "theater"], ["metre", "meter"], ["defence", "defense"], ["licence", "license"], ["offence", "offense"], ["travelling", "traveling"], ["travelled", "traveled"], ["cancelled", "canceled"], ["programme", "program"], ["catalogue", "catalog"], ["tyre", "tire"], ["cheque", "check"], ["plough", "plow"]];

/** Едно и също за британски и американски правопис: -our/-or, -ise/-ize, малък списък изключения. */
function canonWord(w: string): string {
  for (const [uk, us] of PAIRS) if (w === uk) return us;
  if (w.length >= 5 && /our(s|ed|ing)?$/.test(w)) w = w.replace(/our(s|ed|ing)?$/, "or$1");
  if (w.length >= 6) w = w.replace(/is(e|es|ed|ing|ation|ations)$/, "iz$1");
  return w;
}

/** Основна форма за сравнение: без `to` и член отпред, един правопис. */
export function canon(s: string): string {
  let t = normalize(s);
  t = t.replace(/^(to|a|an|the) (?=\S)/, "");
  return t.split(" ").map(canonWord).join(" ");
}

/** accepted: всички приети форми (форма от текста, основна форма, думи със същия превод…). */
export function judge(input: string, accepted: string[]): { verdict: Verdict; matched?: string } {
  const a = canon(input);
  if (!a) return { verdict: "empty" };
  const targets = accepted.map((t) => ({ raw: normalize(t), c: canon(t) })).filter((t) => t.c);
  const exact = targets.find((t) => t.c === a);
  if (exact) return { verdict: "correct", matched: exact.raw };
  const near = targets.find((t) => t.c.length >= 5 && distance(a, t.c) <= (t.c.length >= 9 ? 2 : 1));
  if (near) return { verdict: "almost", matched: near.raw };
  return { verdict: "wrong" };
}

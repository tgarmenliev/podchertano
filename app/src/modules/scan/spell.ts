/*
  Консервативна корекция на очевидни OCR грешки („gontlemas“ → „gentleman“, „nave“ → „have“).
  Правилото е „по-добре да не поправим, отколкото да развалим“. Поправя се само дума, която:
  - не е в речника (с наставки; американски и британски правопис),
  - е изцяло с малки букви (имена, заглавия и съкращения не се пипат),
  - няма апостроф, тире или цифра,
  - е прочетена с не много висока увереност,
  - има ЕДИН ясен кандидат: най-малко редакции и най-честа дума; при равенство не се поправя.
*/
export type Dict = Map<string, number>; // дума -> ниво на честота (10 най-чести ... 70)

export function buildDict(json: Record<string, string[]>): Dict {
  const d: Dict = new Map();
  for (const [lv, words] of Object.entries(json)) for (const w of words) d.set(w, Number(lv));
  return d;
}

const ABC = "abcdefghijklmnopqrstuvwxyz";
function edits1(w: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= w.length; i++) {
    const l = w.slice(0, i);
    const r = w.slice(i);
    if (r) out.add(l + r.slice(1)); // изтриване
    if (r.length > 1) out.add(l + r[1] + r[0] + r.slice(2)); // размяна
    for (const c of ABC) {
      if (r) out.add(l + c + r.slice(1)); // замяна
      out.add(l + c + r); // вмъкване
    }
  }
  out.delete(w);
  return out;
}

export type Fix = { from: string; to: string };

/** Връща поправената дума (в малки букви) или null, ако не бива да се пипа. */
export function correctToken(core: string, conf: number, dict: Dict): string | null {
  if (!/^[a-z]+$/.test(core)) return null; // големи букви, цифри, апостроф, тире: не пипаме
  if (core.length < 4) return null;
  if (dict.has(core)) return null;
  if (conf >= 88) return null; // OCR е сигурен: вероятно рядка дума или име
  type Cand = { w: string; d: number; lv: number };
  const cands: Cand[] = [];
  const e1 = edits1(core);
  for (const w of e1) {
    const lv = dict.get(w);
    if (lv !== undefined && lv <= 50) cands.push({ w, d: 1, lv });
  }
  if (!cands.length && core.length >= 7) {
    const seen = new Set<string>();
    for (const a of e1)
      for (const b of edits1(a)) {
        if (seen.has(b) || b === core) continue;
        seen.add(b);
        const lv = dict.get(b);
        if (lv !== undefined && lv <= 40) cands.push({ w: b, d: 2, lv });
      }
  }
  if (!cands.length) return null;
  cands.sort((p, q) => p.d - q.d || p.lv - q.lv);
  const [best, next] = cands;
  if (next && next.d === best.d && next.lv === best.lv) return null; // двусмислено
  // при две редакции искаме съвпадение поне в началото или в края на думата
  if (best.d === 2 && best.w[0] !== core[0] && best.w[best.w.length - 1] !== core[core.length - 1]) return null;
  return best.w;
}

const split = (t: string) => {
  const m = /^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/.exec(t);
  return m ? { pre: m[1], core: m[2], post: m[3] } : null;
};

export function correctWords<T extends { t: string; conf: number }>(words: T[], dict: Dict): { words: T[]; fixes: Fix[] } {
  const fixes: Fix[] = [];
  const out = words.map((w) => {
    const p = split(w.t);
    if (!p) return w;
    const fixed = correctToken(p.core, w.conf, dict);
    if (!fixed) return w;
    fixes.push({ from: w.t, to: p.pre + fixed + p.post });
    return { ...w, t: p.pre + fixed + p.post };
  });
  return { words: out, fixes };
}

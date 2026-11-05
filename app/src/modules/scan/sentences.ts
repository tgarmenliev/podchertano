import type { ScanWord } from "./types";

/*
  Помощни функции за екрана „Избор на думи“: абзаци от думите, групиране на съседни избрани думи
  във фраза и намиране на изречението, в което са срещнати.
*/
export type Paragraph = { para: number; words: ScanWord[] };

export function paragraphs(words: ScanWord[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && last.para === w.para) last.words.push(w);
    else out.push({ para: w.para, words: [w] });
  }
  return out;
}

export type Item = {
  /** индекси на думите (ScanWord.i) в реда, в който се срещат */
  ids: number[];
  /** както е в текста, без пунктуация по краищата */
  surface: string;
  sentence: string;
};

const strip = (s: string) => s.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "");

/** Разделя абзац на изречения и връща за всяка дума в кое изречение попада. */
function sentenceOf(words: ScanWord[]): Map<number, string> {
  const map = new Map<number, string>();
  let buf: ScanWord[] = [];
  const flush = () => {
    const text = buf.map((w) => w.t).join(" ");
    for (const w of buf) map.set(w.i, text);
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    // край на изречение: . ! ? (не след съкращения като „Mr.“ или число)
    if (/[.!?]["”')]*$/.test(w.t) && !/^(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e)\.$/i.test(w.t) && w.t.length > 2) flush();
  }
  if (buf.length) flush();
  return map;
}

/** От избраните думи прави единици: съседни думи в един ред стават една фраза. */
export function itemsFromSelection(words: ScanWord[]): Item[] {
  const items: Item[] = [];
  for (const p of paragraphs(words)) {
    const sent = sentenceOf(p.words);
    let cur: ScanWord[] = [];
    const close = () => {
      if (!cur.length) return;
      const surface = cur.map((w) => w.t).join(" ");
      const clean = cur.map((w, k) => (k === 0 ? w.t.replace(/^[^A-Za-z0-9']+/, "") : k === cur.length - 1 ? w.t.replace(/[^A-Za-z0-9']+$/, "") : w.t)).join(" ");
      items.push({ ids: cur.map((w) => w.i), surface: strip(clean) || strip(surface), sentence: sent.get(cur[0].i) ?? surface });
      cur = [];
    };
    for (const w of p.words) {
      if (!w.sel) {
        close();
        continue;
      }
      const prev = cur[cur.length - 1];
      if (prev && prev.line !== w.line) close(); // фраза не прекъсва ред
      cur.push(w);
    }
    close();
  }
  return items;
}

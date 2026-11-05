import type { ScanWord } from "./types";
import { underlineScores } from "./underline";

type TWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type TData = { blocks?: { paragraphs: { lines: { words: TWord[] }[] }[] }[] | null };

/** Превръща резултата на tesseract.js в плосък списък от думи с номера на ред и абзац. */
export function wordsFromTesseract(data: TData, minConf = 40): Omit<ScanWord, "score" | "auto" | "sel">[] {
  const out: Omit<ScanWord, "score" | "auto" | "sel">[] = [];
  let line = 0;
  let para = 0;
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs) {
      for (const l of p.lines) {
        let any = false;
        for (const w of l.words) {
          const t = w.text.trim();
          const h = w.bbox.y1 - w.bbox.y0;
          if (!t || !/[A-Za-z0-9]/.test(t) || w.confidence < minConf || h < 8) continue;
          out.push({ i: out.length, t, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h, line, para, conf: Math.round(w.confidence) });
          any = true;
        }
        if (any) line++;
      }
      para++;
    }
  return out;
}

/** Сива яркост от RGBA (canvas ImageData). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
}

/** Прага, над който дума се маркира автоматично като подчертана. */
export const AUTO_THRESHOLD = 0.75;

export function withUnderlines(
  gray: Uint8Array,
  W: number,
  H: number,
  words: Omit<ScanWord, "score" | "auto" | "sel">[],
): ScanWord[] {
  const scores = underlineScores(gray, W, H, words.map((w) => ({ t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line })));
  return words.map((w, k) => ({ ...w, score: Math.round(scores[k] * 100) / 100, auto: scores[k] >= AUTO_THRESHOLD, sel: scores[k] >= AUTO_THRESHOLD }));
}

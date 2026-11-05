import type { ScanWord } from "./types";
import { underlineScores } from "./underline";

type TWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type TData = { blocks?: { paragraphs: { lines: { words: TWord[] }[] }[] }[] | null };

const COMMON_SHORT = new Set(["a", "i", "an", "as", "at", "be", "by", "do", "he", "if", "in", "is", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we", "am", "go", "oh"]);

/** Плосък списък от думи на един проход (без номерация на редове). */
export function rawFromTesseract(data: TData, minConf = 40): RawWord[] {
  const out: RawWord[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines)
        for (const w of l.words) {
          const t = w.text.trim();
          const h = w.bbox.y1 - w.bbox.y0;
          if (!t || !/[A-Za-z0-9]/.test(t) || w.confidence < minConf || h < 8) continue;
          // къс и неуверен низ най-често е шум (линия, петно, част от буква), не дума
          if (t.replace(/[^A-Za-z0-9]/g, "").length <= 2 && w.confidence < 75 && !COMMON_SHORT.has(t.toLowerCase().replace(/[^a-z]/g, ""))) continue;
          out.push({ t, conf: w.confidence, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h });
        }
  return out;
}

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

/* ───────── Няколко прохода на OCR ─────────
   Един проход изпуска около 14% от думите (имена, думи в края на реда). Различните режими на
   сегментиране изпускат различни думи, затова пускаме три и обединяваме резултатите. */
export type RawWord = { t: string; conf: number; x: number; y: number; w: number; h: number };

const area = (a: RawWord) => Math.max(1, a.w * a.h);
function overlap(a: RawWord, b: RawWord) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/** Първият проход е основен; думи от следващите се добавят само ако не повтарят вече намерена. */
export function mergePasses(passes: RawWord[][]): RawWord[] {
  const out: RawWord[] = [];
  for (const pass of passes)
    for (const w of pass) {
      let dup = -1;
      for (let k = 0; k < out.length; k++) {
        const o = out[k];
        const inter = overlap(o, w);
        if (!inter) continue;
        const union = area(o) + area(w) - inter;
        if (inter / union > 0.4 || inter / area(w) > 0.7 || inter / area(o) > 0.7) {
          dup = k;
          break;
        }
      }
      if (dup < 0) out.push(w);
      else if (w.conf > out[dup].conf + 15 && overlap(out[dup], w) / area(out[dup]) > 0.7) out[dup] = w;
    }
  return out;
}

/** Подрежда думите в редове (по височина) и абзаци (по по-голям отвор) и им слага номера. */
export function buildLines(words: RawWord[]): Omit<ScanWord, "score" | "auto" | "sel">[] {
  if (!words.length) return [];
  const hs = words.map((w) => w.h).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)];
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lines: RawWord[][] = [];
  let lineCy = -1e9;
  let cur: RawWord[] = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2;
    if (cur.length && Math.abs(cy - lineCy) > 0.6 * medH) {
      lines.push(cur);
      cur = [];
    }
    cur.push(w);
    lineCy = cur.reduce((s, x) => s + x.y + x.h / 2, 0) / cur.length;
  }
  if (cur.length) lines.push(cur);
  // редове с общ център, но разделени по ширина (колони), остават отделни абзаци по-долу
  const out: Omit<ScanWord, "score" | "auto" | "sel">[] = [];
  let para = 0;
  let prevBottom = -1;
  const centers = lines.map((l) => l.reduce((s, x) => s + x.y + x.h / 2, 0) / l.length);
  const gaps = centers.slice(1).map((c, k) => c - centers[k]).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length * 0.4)] : medH * 1.5;
  lines.forEach((l, li) => {
    l.sort((a, b) => a.x - b.x);
    if (li > 0 && centers[li] - centers[li - 1] > pitch * 1.6) para++;
    for (const w of l) out.push({ i: out.length, t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: li, para, conf: Math.round(w.conf) });
    prevBottom = centers[li];
  });
  void prevBottom;
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
  return words.map((w, k) => {
    const real = w.t.replace(/[^A-Za-z]/g, "").length >= 3 && w.conf >= 55; // шумът (1–2 знака) не се маркира сам
    const auto = real && scores[k] >= AUTO_THRESHOLD;
    return { ...w, score: Math.round(scores[k] * 100) / 100, auto, sel: auto };
  });
}

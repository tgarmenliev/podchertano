import type { ScanWord } from "./types";
import { underlineDetail } from "./underline";

type TWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type TData = { blocks?: { paragraphs: { lines: { words: TWord[] }[] }[] }[] | null };

const COMMON_SHORT = new Set(["a", "i", "an", "as", "at", "be", "by", "do", "he", "if", "in", "is", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we", "am", "go", "oh"]);

/** Плосък списък от думи на един проход (без номерация на редове). */
export function rawFromTesseract(data: TData, minConf = 40): RawWord[] {
  const out: RawWord[] = [];
  let lineNo = 0;
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        lineNo++;
        for (const w of l.words) {
          const t = w.text.trim();
          const h = w.bbox.y1 - w.bbox.y0;
          if (!t || !/[A-Za-z0-9]/.test(t) || w.confidence < minConf || h < 8) continue;
          // къс и неуверен низ най-често е шум (линия, петно, част от буква), не дума
          if (t.replace(/[^A-Za-z0-9]/g, "").length <= 2 && w.confidence < 75 && !COMMON_SHORT.has(t.toLowerCase().replace(/[^a-z]/g, ""))) continue;
          out.push({ t, conf: w.confidence, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h, line: lineNo });
        }
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
export type RawWord = { t: string; conf: number; x: number; y: number; w: number; h: number; /** ред от основния проход (OCR знае за наклона на страницата) */ line?: number };

const area = (a: RawWord) => Math.max(1, a.w * a.h);
function overlap(a: RawWord, b: RawWord) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/** Първият проход е основен; думи от следващите се добавят само ако не повтарят вече намерена. */
export function mergePasses(passes: RawWord[][]): RawWord[] {
  const out: RawWord[] = [];
  passes.forEach((pass, pi) =>
    pass.forEach((w0) => {
      const w: RawWord = pi === 0 ? w0 : { ...w0, line: undefined };
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
      // заменяме само съмнителна дума от основния проход с много по-сигурна от друг проход
      else if (out[dup].conf < 70 && w.conf > out[dup].conf + 25 && overlap(out[dup], w) / area(out[dup]) > 0.7) out[dup] = { ...w, line: out[dup].line ?? w.line };
    }),
  );
  return out;
}

const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const cyOf = (w: RawWord) => w.y + w.h / 2;
const cxOf = (w: RawWord) => w.x + w.w / 2;

/** Групиране само по височина (когато няма информация за редове от OCR). */
function clusterByY(words: RawWord[], medH: number): RawWord[][] {
  const sorted = [...words].sort((a, b) => cyOf(a) - cyOf(b));
  const lines: RawWord[][] = [];
  let lineCy = -1e9;
  let cur: RawWord[] = [];
  for (const w of sorted) {
    if (cur.length && Math.abs(cyOf(w) - lineCy) > 0.6 * medH) {
      lines.push(cur);
      cur = [];
    }
    cur.push(w);
    lineCy = cur.reduce((s, x) => s + cyOf(x), 0) / cur.length;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Права y = a·x + b по средата на думите (най-малки квадрати). */
function fitCenters(ws: RawWord[], fallbackSlope: number): [number, number] {
  if (ws.length < 4) return [fallbackSlope, med(ws.map((w) => cyOf(w) - fallbackSlope * cxOf(w)))];
  const n = ws.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const w of ws) {
    const x = cxOf(w), y = cyOf(w);
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const d = n * sxx - sx * sx;
  const a = d ? (n * sxy - sx * sy) / d : fallbackSlope;
  return [a, (sy - a * sx) / n];
}

/**
 * Подрежда думите в редове и абзаци и им слага номера.
 * Страниците са снимани под ъгъл: редовете са наклонени и в единия край на реда може да са на същата
 * височина като другия край на съседния ред. Затова редовете идват от OCR (той знае наклона), а думите
 * от другите проходи се слагат в най-близкия ред по правата му, не по абсолютна височина.
 */
export function buildLines(words: RawWord[]): Omit<ScanWord, "score" | "auto" | "sel">[] {
  if (!words.length) return [];
  const medH = med(words.map((w) => w.h));
  let groups: RawWord[][];

  if (!words.some((w) => w.line !== undefined)) {
    groups = clusterByY(words, medH);
  } else {
    const byId = new Map<number, RawWord[]>();
    const orphans: RawWord[] = [];
    for (const w of words) {
      if (w.line === undefined) orphans.push(w);
      else (byId.get(w.line) ?? byId.set(w.line, []).get(w.line)!).push(w);
    }
    const lineList = [...byId.values()].map((l) => [...l].sort((p, q) => cxOf(p) - cxOf(q)));
    const gSlope = med(lineList.filter((l) => l.length >= 5).map((l) => fitCenters(l, 0)[0]));
    const midX = med(words.map(cxOf));
    // локалната височина на реда в точка x: интерполация между съседните му думи (следва извивката на страницата)
    const curveY = (l: RawWord[], x: number) => {
      if (x <= cxOf(l[0])) return cyOf(l[0]) + gSlope * (x - cxOf(l[0]));
      for (let i = 1; i < l.length; i++) {
        if (x <= cxOf(l[i])) {
          const t = (x - cxOf(l[i - 1])) / Math.max(1, cxOf(l[i]) - cxOf(l[i - 1]));
          return cyOf(l[i - 1]) * (1 - t) + cyOf(l[i]) * t;
        }
      }
      const last = l[l.length - 1];
      return cyOf(last) + gSlope * (x - cxOf(last));
    };
    const ordered = lineList.map((l) => curveY(l, midX)).sort((p, q) => p - q);
    const gaps = ordered.slice(1).map((y, i) => y - ordered[i]).filter((g) => g > 4);
    const pitch0 = gaps.length ? gaps.sort((x, y) => x - y)[Math.floor(gaps.length * 0.4)] : medH * 1.5;
    // думи от другите проходи -> най-близкия ред ПО ЛОКАЛНАТА КРИВА; ако е далече от всички, става нов ред
    const extra: RawWord[] = [];
    for (const w of orphans) {
      let best = -1;
      let bd = Infinity;
      lineList.forEach((l, k) => {
        if (cxOf(w) < cxOf(l[0]) - 400 || cxOf(w) > cxOf(l[l.length - 1]) + 400) return;
        const d = Math.abs(cyOf(w) - curveY(l, cxOf(w)));
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best >= 0 && bd < 0.45 * pitch0) lineList[best].push(w);
      else extra.push(w);
    }
    groups = lineList;
    if (extra.length) {
      const flat = extra.map((w) => ({ ...w, y: w.y - gSlope * cxOf(w) }));
      const clusters = clusterByY(flat, medH).map((c) => c.map((f) => extra[flat.indexOf(f)]));
      groups = [...lineList, ...clusters];
    }
  }

  // подреждане отгоре надолу по правата на реда в средата на страницата
  const midX = med(words.map(cxOf));
  const gS = med(groups.filter((g) => g.length >= 5).map((g) => fitCenters(g, 0)[0]));
  const keyed = groups.map((g) => {
    const [a, b] = fitCenters(g, gS);
    return { g, y: a * midX + b };
  }).sort((p, q) => p.y - q.y);
  const gapsY = keyed.slice(1).map((k, i) => k.y - keyed[i].y).filter((g) => g > 4).sort((x, y) => x - y);
  const pitch = gapsY.length ? gapsY[Math.floor(gapsY.length * 0.4)] : medH * 1.5;

  const out: Omit<ScanWord, "score" | "auto" | "sel">[] = [];
  let para = 0;
  keyed.forEach((k, li) => {
    k.g.sort((a, b) => a.x - b.x);
    if (li > 0 && k.y - keyed[li - 1].y > pitch * 1.6) para++;
    for (const w of k.g) out.push({ i: out.length, t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: li, para, conf: Math.round(w.conf) });
  });
  return out;
}

/** Сива яркост от RGBA (canvas ImageData). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
}

/**
 * Правило за автоматично маркиране. Изпитано на 5 реални снимки (вкл. страница от помагалото с плътен
 * текст и тъмен молив): ~85–90% от подчертаните думи при малко грешни маркировки.
 * Оценката е дял на колоните под думата със следа от молив; серията е най-дългата непрекъсната следа.
 */
export const AUTO_THRESHOLD = 0.75;
export const AUTO_RUN = 0.5;

export function withUnderlines(
  gray: Uint8Array,
  W: number,
  H: number,
  words: Omit<ScanWord, "score" | "auto" | "sel">[],
): ScanWord[] {
  const det = underlineDetail(gray, W, H, words.map((w) => ({ t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line })));
  return words.map((w, k) => {
    const real = w.t.replace(/[^A-Za-z]/g, "").length >= 3 && w.conf >= 55; // шумът (1–2 знака) не се маркира сам
    const auto = real && det[k].score >= AUTO_THRESHOLD && det[k].run >= AUTO_RUN;
    return { ...w, score: Math.round(det[k].score * 100) / 100, auto, sel: auto };
  });
}

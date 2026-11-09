import type { ScanWord } from "./types";

/*
  Слива текста, прочетен от AI (верният текст и подчертаното), с думите от Tesseract (само за места на снимката).
  Думите на AI са истината; позицията се взима от най-близката дума на Tesseract (подравняване на двете редици).
*/
type Tok = { t: string; u: boolean; line: number; para: number };

/** Разбива редовете на AI на думи; [[ ]] отбелязва подчертаното и може да минава през няколко думи или реда. */
export function parseAiLines(lines: string[]): Tok[] {
  const out: Tok[] = [];
  let inU = false;
  let para = 0;
  let line = 0;
  for (const raw of lines) {
    if (!raw.trim()) {
      para++;
      continue;
    }
    for (const part of raw.split(/\s+/).filter(Boolean)) {
      let p = part;
      let u = inU;
      if (p.includes("[[")) {
        inU = true;
        u = true;
        p = p.replace(/\[\[/g, "");
      }
      const closes = p.includes("]]");
      p = p.replace(/\]\]/g, "");
      if (closes) inU = false;
      if (p) out.push({ t: p, u, line, para });
      else if (closes && out.length) out[out.length - 1].u = out[out.length - 1].u || u;
    }
    line++;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function lev(a: string, b: string): number {
  if (a === b) return 0;
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

const sim = (a: string, b: string) => {
  const m = Math.max(a.length, b.length);
  if (!m) return 0.6;
  return 1 - lev(a, b) / m;
};

/** Подравняване (Needleman–Wunsch): за всяка дума на AI индексът на съответната дума от Tesseract или -1. */
export function align(ai: string[], local: string[]): number[] {
  const n = ai.length;
  const m = local.length;
  const W = m + 1;
  const score = new Int32Array((n + 1) * W);
  const dir = new Uint8Array((n + 1) * W); // 1 диагонал, 2 нагоре (дума на AI без двойка), 3 наляво
  const GAP = -100;
  for (let i = 1; i <= n; i++) {
    score[i * W] = i * GAP;
    dir[i * W] = 2;
  }
  for (let j = 1; j <= m; j++) {
    score[j] = j * GAP;
    dir[j] = 3;
  }
  const a = ai.map(norm);
  const l = local.map(norm);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim(a[i - 1], l[j - 1]);
      const diag = score[(i - 1) * W + j - 1] + (s >= 0.5 ? Math.round(200 * s) : -200);
      const up = score[(i - 1) * W + j] + GAP;
      const left = score[i * W + j - 1] + GAP;
      let best = diag;
      let d = 1;
      if (up > best) {
        best = up;
        d = 2;
      }
      if (left > best) {
        best = left;
        d = 3;
      }
      score[i * W + j] = best;
      dir[i * W + j] = d;
    }
  }
  const map = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i * W + j];
    if (d === 1) {
      if (sim(a[i - 1], l[j - 1]) >= 0.5) map[i - 1] = j - 1;
      i--;
      j--;
    } else if (d === 2) i--;
    else j--;
  }
  return map;
}

/** Нови думи за екрана: текстът на AI, местата от Tesseract, подчертаното от AI. */
export function mergeAi(local: ScanWord[], lines: string[], width: number, height: number): ScanWord[] {
  const toks = parseAiLines(lines);
  const L = [...local].sort((p, q) => p.line - q.line || p.x - q.x);
  const map = align(toks.map((t) => t.t), L.map((w) => w.t));

  const out: ScanWord[] = toks.map((t, k) => {
    const m = map[k] >= 0 ? L[map[k]] : null;
    return { i: k, t: t.t, x: m?.x ?? NaN, y: m?.y ?? NaN, w: m?.w ?? NaN, h: m?.h ?? NaN, line: t.line, para: t.para, conf: m ? m.conf : 50, score: t.u ? 1 : 0, auto: t.u, sel: t.u };
  });

  // думите без двойка получават приблизителна кутия до най-близката намерена
  for (let k = 0; k < out.length; k++) {
    if (!Number.isNaN(out[k].x)) continue;
    let p = k - 1;
    while (p >= 0 && Number.isNaN(out[p].x)) p--;
    let q = k + 1;
    while (q < out.length && Number.isNaN(out[q].x)) q++;
    const prev = p >= 0 ? out[p] : null;
    const next = q < out.length ? out[q] : null;
    const ref = prev ?? next;
    if (!ref) {
      out[k] = { ...out[k], x: 20, y: 20 + out[k].line * 30, w: Math.max(10, out[k].t.length * 10), h: 24 };
      continue;
    }
    const cw = ref.w / Math.max(1, ref.t.length);
    const w = Math.max(10, out[k].t.length * cw);
    const x = prev ? prev.x + prev.w + cw * 0.6 : Math.max(0, next!.x - w - cw * 0.6);
    out[k] = { ...out[k], x: Math.min(Math.max(0, x), Math.max(0, width - w)), y: Math.min(ref.y, Math.max(0, height - ref.h)), w, h: ref.h };
  }
  return out;
}

import type { RawWord } from "./layout";
import type { ScanWord } from "./types";
import { underlineSegments, type TraceContext } from "./underline";

/*
  Връщане на подчертани думи, които OCR е пропуснал или е прочел само частично.
  Моливът е най-сигурният знак: ако под част от реда има следа от молив, а над нея няма добре прочетена дума,
  прочитаме този участък отново САМО над молива (така линията не пречи на буквите), като отделен ред.
*/
export type RecognizeCrop = (box: { x0: number; y0: number; x1: number; y1: number }) => Promise<RawWord[]>;

const letters = (s: string) => s.replace(/[^A-Za-z]/g, "").length;
const solid = (w: ScanWord) => w.conf >= 70 && letters(w.t) >= 3; // „добре прочетена“ дума

export async function recoverMissing(words: ScanWord[], ctx: TraceContext, recognize: RecognizeCrop, maxCrops = 14): Promise<{ words: ScanWord[]; added: string[] }> {
  const segs = underlineSegments(ctx, 50);
  const added: ScanWord[] = [];
  let crops = 0;
  for (const sg of segs) {
    const inLine = words.filter((w) => w.line === sg.line);
    const over = inLine.filter((w) => Math.min(w.x + w.w, sg.x1) - Math.max(w.x, sg.x0) > 4);
    // непокрити интервали: където няма добре прочетена дума
    const cover = over.filter(solid).sort((a, b) => a.x - b.x);
    // участъкът трябва да е „истински“: или под него има маркирана добре прочетена дума, или е дълга следа,
    // над която почти няма прочетен текст (думата е изпусната напълно)
    const coveredLen = cover.reduce((t, w) => t + Math.max(0, Math.min(w.x + w.w, sg.x1) - Math.max(w.x, sg.x0)), 0);
    const qualifies = over.some((w) => w.auto && solid(w)) || (sg.x1 - sg.x0 >= 90 && sg.dark >= 0.85 && coveredLen < 0.3 * (sg.x1 - sg.x0));
    if (!qualifies) continue;
    const gaps: [number, number][] = [];
    let cur = sg.x0;
    for (const w of cover) {
      if (w.x - cur >= 22) gaps.push([cur, w.x]);
      cur = Math.max(cur, w.x + w.w);
    }
    if (sg.x1 - cur >= 22) gaps.push([cur, sg.x1]);
    // слепваме близки интервали
    const merged: [number, number][] = [];
    for (const g of gaps) {
      const last = merged[merged.length - 1];
      if (last && g[0] - last[1] <= 20) last[1] = g[1];
      else merged.push([...g]);
    }
    for (const [ga, gb] of merged) {
      if (crops >= maxCrops) break;
      const mid = (ga + gb) / 2;
      const b = ctx.baseAt(sg.line, Math.min(ctx.W - 1, Math.max(0, mid)));
      if (b === null) continue;
      crops++;
      const box = { x0: Math.max(0, Math.round(ga - 8)), y0: Math.max(0, Math.round(b - 34)), x1: Math.min(ctx.W - 1, Math.round(gb + 8)), y1: Math.round(b + 3) };
      const read = (await recognize(box)).filter((r) => r.conf >= 80 && letters(r.t) >= 4 && /^[A-Za-z][A-Za-z'’-]*[.,;:!?’”)]*$/.test(r.t.replace(/^[‘“(]+/, "")));
      for (const r of read) {
        // не дублираме добре прочетена дума, която вече е там
        const clash = inLine.some((w) => solid(w) && Math.min(w.x + w.w, r.x + r.w) - Math.max(w.x, r.x) > 0.4 * Math.min(w.w, r.w));
        if (clash) continue;
        added.push({ i: -1, t: r.t, x: r.x, y: r.y, w: r.w, h: r.h, line: sg.line, para: inLine[0]?.para ?? 0, conf: Math.round(r.conf), score: 1, auto: true, sel: true });
      }
    }
  }
  if (!added.length) return { words, added: [] };
  // думите с ниска увереност, които са под добавените, се махат (това са остатъци от същата дума)
  const keep = words.filter((w) => !added.some((a) => a.line === w.line && Math.min(w.x + w.w, a.x + a.w) - Math.max(w.x, a.x) > 0.3 * Math.min(w.w, a.w) && !solid(w)));
  const all = [...keep, ...added].sort((a, b) => a.line - b.line || a.x - b.x).map((w, i) => ({ ...w, i }));
  return { words: all, added: added.map((a) => a.t) };
}

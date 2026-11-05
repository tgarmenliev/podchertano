// Безплатно: колко от текста хващат различни комбинации от проходи на OCR (всички 4 реални снимки).
import fs from "node:fs";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

type W = { t: string; conf: number; x0: number; y0: number; x1: number; y1: number };
const norm = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
const iou = (a: W, b: W) => {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  return inter / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter || 1);
};
const same = (a: W, b: W) => iou(a, b) > 0.3 && norm(a.t) === norm(b.t);
const union = (...sets: W[][]) => {
  const out: W[] = [];
  for (const s of sets) for (const w of s) { const k = out.findIndex((o) => iou(o, w) > 0.4); if (k < 0) out.push(w); else if (w.conf > out[k].conf) out[k] = w; }
  return out;
};

const dir = "../bench/data/real-norm";
const workers: Record<string, Awaited<ReturnType<typeof createWorker>>> = {};
for (const m of ["3", "4", "6"]) { const w = await createWorker("eng"); await w.setParameters({ tessedit_pageseg_mode: m as never }); workers[m] = w; }
async function pass(f: string, psm: string, width: number, sharpen = false) {
  let s = sharp(`${dir}/${f}`).resize({ width }); if (sharpen) s = s.sharpen();
  const t0 = Date.now();
  const { data } = await workers[psm].recognize(await s.jpeg({ quality: 90 }).toBuffer(), {}, { blocks: true });
  const scale = 1800 / width;
  const ws = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
    .filter((w) => w.confidence >= 40 && /[A-Za-z0-9]/.test(w.text))
    .map((w) => ({ t: w.text, conf: w.confidence, x0: w.bbox.x0 * scale, y0: w.bbox.y0 * scale, x1: w.bbox.x1 * scale, y1: w.bbox.y1 * scale }));
  return { ws, ms: Date.now() - t0 };
}
const totals: Record<string, { cov: number; n: number; ms: number }> = {};
const add = (k: string, cov: number, n: number, ms: number) => { totals[k] ??= { cov: 0, n: 0, ms: 0 }; totals[k].cov += cov; totals[k].n += n; totals[k].ms += ms; };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort()) {
  const a = await pass(f, "4", 1800), b = await pass(f, "6", 1800), c = await pass(f, "3", 1800), d = await pass(f, "4", 2400, true);
  const ref = union(a.ws, b.ws, c.ws, d.ws).filter((w) => w.conf >= 60);
  const cov = (...sets: W[][]) => ref.filter((r) => sets.some((s) => s.some((w) => same(w, r)))).length;
  const cand: [string, W[][], number][] = [
    ["psm4 (сега)", [a.ws], a.ms], ["psm6", [b.ws], b.ms], ["psm3", [c.ws], c.ms], ["psm4 2400+sharpen", [d.ws], d.ms],
    ["psm4 + psm6", [a.ws, b.ws], a.ms + b.ms], ["psm4 + psm6 + psm3", [a.ws, b.ws, c.ws], a.ms + b.ms + c.ms], ["psm6 + psm3", [b.ws, c.ws], b.ms + c.ms], ["psm4 + psm3", [a.ws, c.ws], a.ms + c.ms], ["psm4 + sharpen2400", [a.ws, d.ws], a.ms + d.ms], ["psm4 + psm6 + sharpen2400", [a.ws, b.ws, d.ws], a.ms + b.ms + d.ms],
  ];
  for (const [k, sets, ms] of cand) add(k, cov(...sets), ref.length, ms);
}
console.log("Дял от текста (еталон: обединение на всички проходи, увереност≥60), сумарно за 4-те снимки\n");
for (const [k, v] of Object.entries(totals)) console.log(k.padEnd(28), `${(100 * v.cov / v.n).toFixed(1)}%`.padStart(7), `  ${(v.ms / 4000).toFixed(1)} s на страница`);
for (const w of Object.values(workers)) await w.terminate();

// Оценка на конвейер B върху синтетичния набор: OCR точност + precision/recall за подчертаното.
// Употреба: node eval.mjs [папка=data/synthetic] [bandFrac] [inkThr]
import fs from "node:fs";
import path from "node:path";
const { analyze } = await import(process.env.PIPE ?? "./pipeline-b2.mjs");

const dir = process.argv[2] ?? path.join(import.meta.dirname, "data", "synthetic");
const opts = {};
if (process.argv[3]) opts.bandFrac = +process.argv[3];
if (process.argv[4]) opts.inkThr = +process.argv[4];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const rows = []; // за всяка гт дума: {ul, score|null}
let gtTotal = 0, ocrMatched = 0, ocrTextOk = 0, fpUnmatched = [];
const perImage = [];
const t0 = Date.now();
for (const f of files) {
  const gt = JSON.parse(fs.readFileSync(path.join(dir, f.replace(".jpg", ".json")), "utf8"));
  const res = await analyze(path.join(dir, f), opts);
  const used = new Set();
  let matchedImg = 0;
  const found = new Map();
  for (const ow of res.words) {
    // гт думата, чийто център е в кутията на OCR думата
    const cand = gt.words.map((g, i) => [g, i]).filter(([g, i]) => !used.has(i) && g.cx >= ow.left - 3 && g.cx <= ow.left + ow.w + 3 && g.cy >= ow.top - 3 && g.cy <= ow.top + ow.h + 3);
    if (!cand.length) { fpUnmatched.push({ f, text: ow.text, score: ow.score }); continue; }
    cand.sort((a, b) => (norm(b[0].text) === norm(ow.text)) - (norm(a[0].text) === norm(ow.text)));
    const [g, i] = cand[0]; used.add(i); found.set(i, ow); matchedImg++;
    if (norm(g.text) === norm(ow.text)) ocrTextOk++;
  }
  gt.words.forEach((g, i) => { const ow = found.get(i); rows.push({ f, ul: g.ul, score: ow ? ow.score : null, text: g.text, ocr: ow?.text }); });
  gtTotal += gt.words.length; ocrMatched += matchedImg;
  const ulImg = gt.words.filter((g) => g.ul).length;
  perImage.push({ f, cond: gt.cond, meta: gt.meta, angleEst: +res.angleDeg.toFixed(2), words: gt.words.length, ul: ulImg, ocrMatched: matchedImg });
  process.stdout.write(`${f} ocr ${matchedImg}/${gt.words.length}  angle ${gt.cond.angleDeg}° est ${res.angleDeg.toFixed(2)}°\n`);
}

function metrics(thr) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) {
    const pred = r.score !== null && r.score >= thr;
    if (pred && r.ul) tp++; else if (pred && !r.ul) fp++; else if (!pred && r.ul) fn++;
  }
  const p = tp / (tp + fp || 1), rc = tp / (tp + fn || 1);
  return { thr, tp, fp, fn, precision: +p.toFixed(3), recall: +rc.toFixed(3), f1: +((2 * p * rc) / (p + rc || 1)).toFixed(3) };
}
const sweep = [0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map(metrics);
const best = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));
console.log("\nOCR: съпоставени", ocrMatched, "/", gtTotal, `(${((100 * ocrMatched) / gtTotal).toFixed(1)}%), точен текст ${ocrTextOk}`);
console.table(sweep);
console.log("най-добър праг:", best);

// по условия: грешки по плътност на молива
const byDens = {};
for (const r of rows) {
  const im = perImage.find((p) => p.f === r.f); const k = im.meta.alpha < 0.5 ? "бледо(<0.5)" : im.meta.alpha < 0.75 ? "средно" : "плътно(>=0.75)";
  byDens[k] ??= { tp: 0, fn: 0, fp: 0 };
  const pred = r.score !== null && r.score >= best.thr;
  if (pred && r.ul) byDens[k].tp++; else if (pred && !r.ul) byDens[k].fp++; else if (!pred && r.ul) byDens[k].fn++;
}
console.log("по плътност (праг", best.thr + "):"); console.table(byDens);
const missed = rows.filter((r) => r.ul && !(r.score >= best.thr)).slice(0, 12);
const falsep = rows.filter((r) => !r.ul && r.score >= best.thr).slice(0, 12);
console.log("пропуснати (пример):", missed.map((r) => `${r.f}:${r.text}:${r.score === null ? "no-ocr" : r.score.toFixed(2)}`).join(" | "));
console.log("фалшиви (пример):", falsep.map((r) => `${r.f}:${r.text}:${r.score.toFixed(2)}`).join(" | "));
console.log(`време ${((Date.now() - t0) / 1000).toFixed(0)}s за ${files.length} снимки`);
fs.writeFileSync(path.join(import.meta.dirname, "data", "last-eval.json"), JSON.stringify({ opts, sweep, best, perImage }, null, 1));

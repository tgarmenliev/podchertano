// Кои подчертани думи се четат непълно: за всяка очаквана дума търсим най-близкия прочетен низ.
import fs from "node:fs";
import { buildLines, mergePasses } from "../src/modules/scan/layout";
const f = process.argv[2] ?? "IMG_0623.jpg";
const TP = ["arranged", "parting", "injunctions", "bearing", "concerning", "inquiries", "certain", "elderly", "gentleman", "amiable", "moor", "cruel", "injustice", "preserve", "groom", "moorland", "farmers", "whom", "folk", "precautions", "imprudent", "misfortune"];
const words = buildLines(mergePasses(JSON.parse(fs.readFileSync(`../bench/data/ocr-cache/${f}.json`, "utf8"))));
const lev = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const norm = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
for (const t of TP) {
  let best = { w: "", d: 99, conf: 0 };
  for (const w of words) { const d = lev(t, norm(w.t)); if (d < best.d) best = { w: w.t, d, conf: w.conf }; }
  console.log(`${t.padEnd(12)} → ${best.d === 0 ? "✓" : best.d <= 3 ? "≈ " + best.w + " (d=" + best.d + ")" : "✗ няма (най-близко: " + best.w + ")"}  conf ${best.conf}`);
}

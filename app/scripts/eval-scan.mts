// Оценка на откриването на подчертаното върху всички реални снимки (безплатно, локално).
// OCR резултатите се кешират, за да се настройва алгоритъмът бързо. Употреба: tsx scripts/eval-scan.mts [--detail]
import fs from "node:fs";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { buildLines, mergePasses, rawFromTesseract, type RawWord } from "../src/modules/scan/layout";
import { underlineDetail } from "../src/modules/scan/underline";

const dir = "../bench/data/real-norm";
const cacheDir = "../bench/data/ocr-cache";
fs.mkdirSync(cacheDir, { recursive: true });
const norm = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
// думи, за които със сигурност има линия под тях (на око)
const known: Record<string, string[]> = {
  "IMG_0603.jpg": ["technical", "university", "continues", "representative", "information"],
  "IMG_0604.jpg": ["support", "transport", "railway", "data", "internal", "selection", "preparation", "entrepreneurial", "feedback", "identification", "further"],
  "IMG_0605.jpg": ["13", "may", "positive", "pitch", "presentation", "public", "website"],
  "IMG_0606.jpg": ["success", "story", "railway", "stakeholders", "entered", "framework", "pitching"],
  "IMG_0623.jpg": ["arranged", "parting", "injunctions", "bearing", "concerning", "inquiries", "elderly", "gentleman", "amiable", "moor", "cruel", "injustice", "preserve", "groom", "moorland", "farmers", "folk", "precautions", "imprudent", "misfortune"],
};
const detail = process.argv.includes("--detail");
let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
async function ocr(f: string): Promise<RawWord[][]> {
  const cache = `${cacheDir}/${f}.json`;
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  worker ??= await createWorker("eng");
  const jpeg = await sharp(`${dir}/${f}`).resize({ width: 1800 }).jpeg({ quality: 90 }).toBuffer();
  const passes: RawWord[][] = [];
  for (const m of ["4", "6", "3"]) {
    await worker.setParameters({ tessedit_pageseg_mode: m as never });
    const { data } = await worker.recognize(jpeg, {}, { blocks: true });
    passes.push(rawFromTesseract(data as never));
  }
  fs.writeFileSync(cache, JSON.stringify(passes));
  return passes;
}

const configs: Record<string, { th: number; run: number; opts?: Record<string, number> }> = {
  "праг 0.75": { th: 0.75, run: 0 },
  "праг 0.65": { th: 0.65, run: 0 },
  "праг 0.65 + серия 0.5": { th: 0.65, run: 0.5 },
  "праг 0.6 + серия 0.5": { th: 0.6, run: 0.5 },
  "праг 0.7 + серия 0.6": { th: 0.7, run: 0.6 },
};
const totals: Record<string, { hit: number; exp: number; flagged: number }> = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort()) {
  const { data, info } = await sharp(`${dir}/${f}`).resize({ width: 1800 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const gray = new Uint8Array(info.width * info.height).map((_, i) => data[i * info.channels]);
  const words = buildLines(mergePasses(await ocr(f)));
  const det = underlineDetail(gray, info.width, info.height, words.map((w) => ({ t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line })));
  console.log(`\n${f}: ${words.length} думи`);
  for (const [name, c] of Object.entries(configs)) {
    const flagged = words.filter((w, i) => w.t.replace(/[^A-Za-z]/g, "").length >= 3 && w.conf >= 55 && det[i].score >= c.th && det[i].run >= c.run);
    const exp = known[f] ?? [];
    const hit = exp.filter((k) => flagged.some((w) => norm(w.t) === k)).length;
    totals[name] ??= { hit: 0, exp: 0, flagged: 0 };
    totals[name].hit += hit; totals[name].exp += exp.length; totals[name].flagged += flagged.length;
    console.log(`  ${name.padEnd(24)} известни ${hit}/${exp.length}  маркирани ${flagged.length}${detail ? "  → " + flagged.map((w) => w.t).join(" ") : ""}`);
  }
}
console.log("\nОбщо:");
for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(24)} ${v.hit}/${v.exp} известни (${Math.round((100 * v.hit) / v.exp)}%), общо маркирани ${v.flagged} (≈${v.flagged - v.hit} не-известни)`);
if (worker) await (worker as { terminate(): Promise<unknown> }).terminate();

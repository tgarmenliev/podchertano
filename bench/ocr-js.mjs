// Безплатна проверка: tesseract.js (WASM) срещу CLI на Tesseract. Без мрежови заявки към платени услуги.
import { createWorker } from "tesseract.js";
import fs from "node:fs";
import sharp from "sharp";
import { ocrTsv } from "./pipeline-b.mjs";

const dir = "data/real-norm";
const widths = process.argv.slice(2).map(Number); // напр. 1600 1200
for (const w of widths.length ? widths : [1800]) {
  const worker = await createWorker("eng");
  console.log(`\n== tesseract.js, ширина ${w}px`);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort()) {
    const buf = await sharp(`${dir}/${f}`).resize({ width: w }).jpeg({ quality: 85 }).toBuffer();
    const t0 = Date.now();
    const { data } = await worker.recognize(buf, {}, { blocks: true });
    const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    const cli = ocrTsv(`${dir}/${f}`).length;
    console.log(f, `js: ${words.length} думи за ${((Date.now() - t0) / 1000).toFixed(1)}s | CLI (пълен размер): ${cli} думи`);
  }
  await worker.terminate();
}

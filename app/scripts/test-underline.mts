// Безплатен тест: tesseract.js + нашият модул за подчертаване върху реалните снимки (4 бр., вечерна лампа).
// Сравнява с резултатите на bench/pipeline-b2 и с ръчно (на око) определени подчертани думи.
import fs from "node:fs";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { wordsFromTesseract, withUnderlines } from "../src/modules/scan/layout";

const dir = process.argv[2] ?? "../bench/data/real-norm";
const worker = await createWorker("eng");
await worker.setParameters({ tessedit_pageseg_mode: "4" as never });
const known: Record<string, string[]> = {
  // думи, за които със сигурност има линия под тях (на око, от снимките)
  "IMG_0604.jpg": ["support", "transport", "railway", "data", "internal", "selection,", "preparation", "entrepreneurial", "feedback", "identification", "further"],
  "IMG_0603.jpg": ["Technical", "University", "continues", "representative", "information"],
  "IMG_0605.jpg": ["13", "May", "positive", "Pitch", "presentation", "public", "website"],
  "IMG_0606.jpg": ["success", "story", "railway", "stakeholders,", "entered", "framework", "pitching,"],
};
let hit = 0, total = 0, flaggedTotal = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort()) {
  const { data, info } = await sharp(`${dir}/${f}`).resize({ width: 1800 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const gray = new Uint8Array(data.buffer, data.byteOffset, info.width * info.height * (info.channels === 1 ? 1 : 1));
  const g1 = info.channels === 1 ? gray : new Uint8Array(info.width * info.height).map((_, i) => data[i * info.channels]);
  const jpeg = await sharp(`${dir}/${f}`).resize({ width: 1800 }).jpeg({ quality: 88 }).toBuffer();
  const t0 = Date.now();
  const { data: ocr } = await worker.recognize(jpeg, {}, { blocks: true });
  const ocrMs = Date.now() - t0;
  const words = withUnderlines(g1, info.width, info.height, wordsFromTesseract(ocr as never));
  const flagged = words.filter((w) => w.auto);
  flaggedTotal += flagged.length;
  const expected = known[f] ?? [];
  const found = expected.filter((e) => flagged.some((w) => w.t === e));
  hit += found.length; total += expected.length;
  console.log(`${f}: ${words.length} думи, ${ocrMs}ms OCR, маркирани ${flagged.length}; известни подчертани намерени ${found.length}/${expected.length}`);
  console.log("   маркирани:", flagged.map((w) => w.t).join(" "));
}
console.log(`\nИзвестни подчертани намерени: ${hit}/${total}; общо маркирани: ${flaggedTotal}`);
await worker.terminate();

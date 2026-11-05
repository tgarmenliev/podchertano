// Копира файловете за OCR в public/ocr, за да се сервират от нашия сайт (без външни CDN:
// по-бързо, работи офлайн след първото зареждане и не изпраща данни на трети страни).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
fs.mkdirSync(path.join(out, "lang"), { recursive: true });

const tj = path.dirname(require.resolve("tesseract.js/package.json"));
const coreDir = path.dirname(require.resolve("tesseract.js-core/package.json", { paths: [tj] }));
const langDir = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));

fs.copyFileSync(path.join(tj, "dist", "worker.min.js"), path.join(out, "worker.min.js"));
for (const f of fs.readdirSync(coreDir)) if (/^tesseract-core.*lstm.*\.wasm\.js$/.test(f)) fs.copyFileSync(path.join(coreDir, f), path.join(out, f));
fs.copyFileSync(path.join(langDir, "4.0.0_best_int", "eng.traineddata.gz"), path.join(out, "lang", "eng.traineddata.gz"));
console.log("OCR файловете са копирани в public/ocr:", fs.readdirSync(out).join(", "));

// Компактен речник за корекция на очевидни OCR грешки: форми на думи (с наставки) от SCOWL, американски и
// британски правопис, подредени по честота (10 = най-чести ... 70 = по-редки). Записва public/ocr/words.json.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wl = require("wordlist-english");
const levels = [10, 20, 35, 40, 50, 55, 60, 70];
const variants = ["english", "english/american", "english/british", "english/canadian", "english/australian"];
const seen = new Map();
for (const lv of levels)
  for (const v of variants)
    for (const w0 of wl[`${v}/${lv}`] ?? (v === "english" ? wl[`english/${lv}`] : []) ?? []) {
      const w = w0.toLowerCase();
      if (!/^[a-z]+$/.test(w)) continue;
      if (!seen.has(w) || seen.get(w) > lv) seen.set(w, lv);
    }
const out = {};
for (const lv of levels) out[lv] = [];
for (const [w, lv] of seen) out[lv].push(w);
for (const lv of levels) out[lv].sort();
const file = path.join(path.resolve(import.meta.dirname, ".."), "public", "ocr", "words.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
const total = [...seen.keys()].length;
console.log(`речник: ${total} думи, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB (до level 70)`);

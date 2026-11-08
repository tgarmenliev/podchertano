import fs from "node:fs";
import { buildLines, mergePasses } from "../src/modules/scan/layout";
const f = process.argv[2] ?? "IMG_0623.jpg";
const words = buildLines(mergePasses(JSON.parse(fs.readFileSync(`../bench/data/ocr-cache/${f}.json`, "utf8"))));
const lines = new Map<number, string[]>();
for (const w of words) (lines.get(w.line) ?? lines.set(w.line, []).get(w.line)!).push(w.t);
let n = 0;
for (const [, l] of lines) { console.log(l.join(" ")); if (++n >= Number(process.argv[3] ?? 14)) break; }

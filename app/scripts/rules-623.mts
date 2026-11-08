import fs from "node:fs";
import sharp from "sharp";
import { buildLines, mergePasses } from "../src/modules/scan/layout";
import { underlineDetail } from "../src/modules/scan/underline";
const f = process.argv[2] ?? "IMG_0623.jpg", dir = "../bench/data/real-norm";
const TPS: Record<string, string[]> = {
  "IMG_0623.jpg": ["arranged", "parting", "injunctions", "bearing", "concerning", "inquiries", "certain", "elderly", "gentleman", "amiable", "moor", "cruel", "injustice", "preserve", "groom", "moorland", "farmers", "whom", "folk", "precautions", "imprudent", "misfortune"],
};
const TP = TPS[f] ?? [];
const norm = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
const { data, info } = await sharp(`${dir}/${f}`).resize({ width: 1800 }).grayscale().raw().toBuffer({ resolveWithObject: true });
const gray = new Uint8Array(info.width * info.height).map((_, i) => data[i * info.channels]);
const words = buildLines(mergePasses(JSON.parse(fs.readFileSync(`../bench/data/ocr-cache/${f}.json`, "utf8"))));
const det = underlineDetail(gray, info.width, info.height, words.map((w) => ({ t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line })));
for (const [th, run] of [[0.75, 0], [0.7, 0.5], [0.75, 0.5], [0.8, 0.6], [0.7, 0.4], [0.65, 0.4]]) {
  const fl = words.filter((w, i) => w.t.replace(/[^A-Za-z]/g, "").length >= 3 && w.conf >= 55 && det[i].score >= th && det[i].run >= run);
  const hit = TP.filter((t) => fl.some((w) => norm(w.t) === t));
  console.log(`score≥${th} run≥${run}: прочетени ${hit.length}/${TP.length}; други маркирани (${fl.filter((w) => !TP.includes(norm(w.t))).length}): ${fl.filter((w) => !TP.includes(norm(w.t))).map((w) => w.t).join(" ")}\n   пропуснати: ${TP.filter((t) => !hit.includes(t)).join(" ")}`);
}

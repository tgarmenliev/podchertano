import fs from "node:fs";
import sharp from "sharp";
import { buildLines, mergePasses } from "../src/modules/scan/layout";
import { underlineDetail } from "../src/modules/scan/underline";
const dir = "../bench/data/real-norm";
const norm = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
const known: Record<string, string[]> = {
  "IMG_0603.jpg": ["technical", "university", "continues", "representative", "information"],
  "IMG_0604.jpg": ["support", "transport", "railway", "data", "internal", "selection", "preparation", "entrepreneurial", "feedback", "identification", "further"],
  "IMG_0605.jpg": ["13", "may", "positive", "pitch", "presentation", "public", "website"],
  "IMG_0606.jpg": ["success", "story", "railway", "stakeholders", "entered", "framework", "pitching"],
  "IMG_0623.jpg": ["arranged", "parting", "injunctions", "bearing", "concerning", "inquiries", "certain", "elderly", "gentleman", "amiable", "moor", "cruel", "injustice", "preserve", "groom", "moorland", "farmers", "folk", "precautions", "imprudent", "misfortune", "whom"],
};
const imgs = Object.keys(known);
const data: Record<string, { gray: Uint8Array; W: number; H: number; words: ReturnType<typeof buildLines> }> = {};
for (const f of imgs) {
  const { data: d, info } = await sharp(`${dir}/${f}`).resize({ width: 1800 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  data[f] = { gray: new Uint8Array(info.width * info.height).map((_, i) => d[i * info.channels]), W: info.width, H: info.height, words: buildLines(mergePasses(JSON.parse(fs.readFileSync(`../bench/data/ocr-cache/${f}.json`, "utf8")))) };
}
type Rule = { th: number; run: number };
const rules: Rule[] = [{ th: 0.6, run: 0 }, { th: 0.75, run: 0 }, { th: 0.7, run: 0.5 }, { th: 0.8, run: 0.6 }];
console.log("refine bandStart bandFrac | правило | известни | не-известни маркирани (603,604,605,606,623)");
for (const refine of [true]) for (const bandStart of [2, 3, 4]) for (const bandFrac of [0.4, 0.55, 0.7, 0.9]) {
  const res: Record<string, { hit: number; exp: number; extra: number[] }> = {};
  for (const f of imgs) {
    const { gray, W, H, words } = data[f];
    const det = underlineDetail(gray, W, H, words.map((w) => ({ t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, line: w.line })), { bandStart, bandFrac, refine, inkThr: 0.88, delta: 0.1 });
    rules.forEach((r) => {
      const flagged = words.filter((w, i) => w.t.replace(/[^A-Za-z]/g, "").length >= 3 && w.conf >= 55 && det[i].score >= r.th && det[i].run >= r.run);
      const hit = known[f].filter((k) => flagged.some((w) => norm(w.t) === k)).length;
      const key = `${r.th}/${r.run}`;
      res[key] ??= { hit: 0, exp: 0, extra: [] };
      res[key].hit += hit; res[key].exp += known[f].length; res[key].extra.push(flagged.length - hit);
    });
  }
  for (const [k, v] of Object.entries(res)) console.log(`${refine} ${bandStart} ${bandFrac} | ${k.padEnd(8)} | ${v.hit}/${v.exp} (${Math.round((100 * v.hit) / v.exp)}%) | ${v.extra.join(",")}  Σ${v.extra.reduce((a, b) => a + b, 0)}`);
}

// Прогон върху реални снимки и анотирани изходи (зелено = открито подчертаване).
import sharp from "sharp";
import fs from "node:fs";
const { analyze } = await import(process.env.PIPE ?? "./pipeline-b2.mjs");
const thr = Number(process.argv[3] ?? 0.75);
const src = process.argv[2];
const outDir = "data/real-out"; fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(src).filter((x) => x.endsWith(".jpg")).sort()) {
  const r = await analyze(`${src}/${f}`);
  const meta = await sharp(`${src}/${f}`).metadata();
  const flagged = r.words.filter((w) => w.score >= thr);
  const rects = r.words.map((w) => w.score >= thr ? `<rect x="${w.left}" y="${w.top}" width="${w.w}" height="${w.h}" fill="rgba(0,200,0,0.25)" stroke="lime" stroke-width="2"/>` : w.score >= 0.4 ? `<rect x="${w.left}" y="${w.top}" width="${w.w}" height="${w.h}" fill="none" stroke="orange" stroke-width="1"/>` : "").join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${rects}</svg>`);
  await sharp(`${src}/${f}`).composite([{ input: svg }]).jpeg({ quality: 85 }).toFile(`${outDir}/${f}`);
  console.log(f, `${meta.width}x${meta.height}`, "angle", r.angleDeg.toFixed(2), "pitch", r.pitch.toFixed(1), "words", r.words.length, "flagged", flagged.length);
  console.log("  ", flagged.map((w) => `${w.text}(${w.score.toFixed(2)})`).join(" "));
}

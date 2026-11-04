import sharp from "sharp"; import fs from "node:fs";
const [model, img, out] = process.argv.slice(2);
const res = JSON.parse(fs.readFileSync(`data/c/${model}.json`, "utf8"))[img];
const p = `data/real-norm/${img}`; const m = await sharp(p).metadata();
const rects = res.filter(w=>w.flag).map(w=>`<rect x="${w.left}" y="${w.top}" width="${w.w}" height="${w.h}" fill="rgba(0,120,255,0.25)" stroke="blue" stroke-width="2"/>`).join("");
const full = await sharp(p).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}">${rects}</svg>`)}]).png().toBuffer();
await sharp(full).resize(1100).jpeg({quality:85}).toFile(out);
console.log(res.filter(w=>w.flag).map(w=>w.text).join(" "));

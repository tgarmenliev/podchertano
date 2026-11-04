import sharp from "sharp";
const { analyze } = await import("./pipeline-b2.mjs");
const [img, re, out, crop] = process.argv.slice(2);
const o = { trace: re, out: [] };
const r = await analyze(img, o);
const meta = await sharp(img).metadata();
let svg = "";
for (const t of o.out) {
  svg += `<rect x="${t.box[0]}" y="${t.box[1]}" width="${t.box[2]}" height="${t.box[3]}" fill="none" stroke="cyan"/>`;
  svg += `<polygon points="${t.xa},${t.a*t.xa+t.b+t.y0} ${t.xb},${t.a*t.xb+t.b+t.y0} ${t.xb},${t.a*t.xb+t.b+t.y1} ${t.xa},${t.a*t.xa+t.b+t.y1}" fill="rgba(255,0,0,0.25)" stroke="red"/>`;
  console.log(t.text, r.words.find(w=>w.text===t.text && w.left===t.box[0])?.score.toFixed(2));
}
const full = await sharp(img).composite([{input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${svg}</svg>`)}]).png().toBuffer();
const [l,t,w,h] = crop.split(",").map(Number);
await sharp(full).extract({left:l,top:t,width:w,height:h}).toFile(out);

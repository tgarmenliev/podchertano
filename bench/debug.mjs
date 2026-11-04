import sharp from "sharp";
import { analyze } from "./pipeline-b.mjs";
const f = process.argv[2], out = process.argv[3];
const r = await analyze(f, { debug: true });
// цветове: червено = ленти без ink, зелено = с ink (>=0.7)
const rects = r.bands.map(([x0,y0,x1,y1],i)=>`<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="none" stroke="${(r.words[i]?.score??0)>=0.7?'lime':'red'}" stroke-width="1"/>`).join("");
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${r.W}" height="${r.H}">${rects}</svg>`);
const full = await sharp(r.gray,{raw:{width:r.W,height:r.H,channels:1}}).composite([{input:svg}]).png().toBuffer();
await sharp(full).extract({left:200,top:300,width:1100,height:600}).toFile(out);
console.log("pitch", r.pitch, "angle", r.angleDeg);

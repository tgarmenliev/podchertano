import fs from "node:fs";
const cmp = JSON.parse(fs.readFileSync("data/cmp.json", "utf8"));
// слепи пътеки, определени на око от изрязани редове (разгледани отделно)
const FP = new Set(["IMG_0603:and","IMG_0604:Ht","IMG_0604:from","IMG_0605:final","IMG_0605:on","IMG_0605:distinction","IMG_0605:of","IMG_0605:Evidence@515","IMG_0606:tna","IMG_0606:EUt+","IMG_0606:incubation"]);
const MISSED_BY_ALL = 8; // на око: materials, station, start-up project, participation, support period, subsequent...
const isFP = (img, r) => FP.has(`${img}:${r.text}`) || FP.has(`${img}:${r.text}@${r.left}`);
const stat = { terra: { tp: 0, fp: 0 }, haiku: { tp: 0, fp: 0 }, sonnet: { tp: 0, fp: 0 } };
let gt = 0;
for (const [img, rows] of Object.entries(cmp)) for (const r of rows) {
  const fp = isFP(img.replace(".jpg", ""), r); if (!fp) gt++;
  for (const k of Object.keys(stat)) if (r.votes[k]) fp ? stat[k].fp++ : stat[k].tp++;
}
const total = gt + MISSED_BY_ALL;
console.log("истина (приблизителна):", total, "думи");
for (const [k, s] of Object.entries(stat)) console.log(k.padEnd(7), `TP ${s.tp}  FP ${s.fp}  precision ${(100*s.tp/(s.tp+s.fp)).toFixed(0)}%  recall ${(100*s.tp/total).toFixed(0)}%`);

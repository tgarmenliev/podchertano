import { analyze } from "./pipeline-b.mjs";
const r = await analyze("data/synthetic/001.jpg", { debug: true });
const i = r.words.findIndex(w=>w.text==="series");
const [xa,y0,xb,y1] = r.bands[i];
console.log("band", xa,y0,xb,y1);
for (let y=y0-6;y<=y1+2;y++){ let row=[]; for(let x=xa;x<=xb;x+=Math.ceil((xb-xa)/14)) row.push(r.gray[y*r.W+x]); console.log(y,row.join(" ")); }
console.log("bg len", r.bg.length, r.W*r.H);
console.log("bg samples", [0,1,2,3].map(k=>r.bg[(y0+5)*r.W+xa+k*20]));

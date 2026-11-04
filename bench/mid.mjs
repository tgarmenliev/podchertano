const { analyze } = await import("./pipeline-b2.mjs");
import fs from "node:fs";
const opts = JSON.parse(process.argv[2] ?? "{}");
for (const f of fs.readdirSync("data/real-norm").sort()) {
  const r = await analyze("data/real-norm/" + f, opts);
  const hi = r.words.filter(w=>w.score>=0.75).length;
  const mid = r.words.filter(w=>w.score>=0.4 && w.score<0.75);
  console.log(f, "hi", hi, "mid", mid.length, ":", mid.map(w=>`${w.text}(${w.score.toFixed(2)})`).join(" "));
}

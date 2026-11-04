import fs from "node:fs";
const M = { terra: "gpt-6.1-terra-low", haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" };
const data = Object.fromEntries(Object.entries(M).map(([k, f]) => [k, JSON.parse(fs.readFileSync(`data/c/${f}.json`, "utf8"))]));
const out = {};
for (const img of Object.keys(data.terra)) {
  const map = new Map();
  for (const [k, d] of Object.entries(data)) for (const w of d[img]) {
    const key = `${w.left},${w.top}`; if (!map.has(key)) map.set(key, { ...w, votes: {} }); map.get(key).votes[k] = w.flag;
  }
  const rows = [...map.values()].filter((r) => Object.values(r.votes).some(Boolean)).sort((a, b) => a.top - b.top || a.left - b.left);
  out[img] = rows;
  console.log(`\n${img}`);
  for (const r of rows) console.log(`  ${r.votes.terra ? "T" : "-"}${r.votes.haiku ? "H" : "-"}${r.votes.sonnet ? "S" : "-"}  ${r.text}  @${r.left},${r.top}`);
}
fs.writeFileSync("data/cmp.json", JSON.stringify(out));

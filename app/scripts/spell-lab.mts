// Кои думи би поправила корекцията на всички реални снимки (за ръчна проверка: няма ли развалени думи).
import fs from "node:fs";
import { buildLines, mergePasses, type RawWord } from "../src/modules/scan/layout";
import { buildDict, correctWords } from "../src/modules/scan/spell";
const dict = buildDict(JSON.parse(fs.readFileSync("public/ocr/words.json", "utf8")));
let total = 0;
for (const f of fs.readdirSync("../bench/data/ocr-cache").filter((x) => x.endsWith(".json")).sort()) {
  const words = buildLines(mergePasses(JSON.parse(fs.readFileSync(`../bench/data/ocr-cache/${f}`, "utf8")) as RawWord[][]));
  const { fixes } = correctWords(words, dict);
  total += fixes.length;
  console.log(`${f.replace(".json", "")}: ${words.length} думи, поправени ${fixes.length}: ${fixes.map((x) => `${x.from}→${x.to}`).join("  ")}`);
}
console.log(`общо поправени: ${total}`);

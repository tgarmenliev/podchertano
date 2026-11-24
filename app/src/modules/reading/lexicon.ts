import fs from "node:fs";
import path from "node:path";

/*
  Честота на думите (10 най-чести ... 70 най-редки) от същия речник, който ползва OCR корекцията.
  Чете се само на сървъра и само веднъж. Ако файлът липсва, всичко работи без този признак.
*/
let cache: Map<string, number> | null | undefined;

export function tierOf(word: string): number | undefined {
  if (cache === undefined) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "ocr", "words.json"), "utf8")) as Record<string, string[]>;
      const m = new Map<string, number>();
      for (const [lv, words] of Object.entries(json)) for (const w of words) m.set(w, Number(lv));
      cache = m;
    } catch {
      cache = null;
    }
  }
  return cache?.get(word.toLowerCase());
}

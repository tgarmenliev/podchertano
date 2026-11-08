import { describe, expect, it } from "vitest";
import { withUnderlines } from "./layout";
import type { ScanWord } from "./types";

/* Синтетична страница: наклонени редове от „букви“ (блокчета с междини), плътен тесен интервал,
   вълнообразна тъмна следа под част от думите, опашки на букви под други. Проверява основната логика. */
function page(under: Set<number>, tail: Set<number>) {
  const W = 1200, H = 520;
  const g = new Uint8Array(W * H).fill(210);
  const words: Omit<ScanWord, "score" | "auto" | "sel">[] = [];
  const slope = 0.02;
  let idx = 0;
  for (let line = 0; line < 8; line++) {
    for (let wd = 0; wd < 8; wd++) {
      const x0 = 40 + wd * 138;
      const base = (x: number) => 70 + line * 54 + slope * x;
      const wx = 100;
      for (let l = 0; l < 6; l++) {
        const lx = x0 + l * 17;
        for (let x = lx; x < lx + 13; x++) for (let y = Math.round(base(x)) - 24; y <= Math.round(base(x)); y++) g[y * W + x] = 30; // буква
      }
      if (tail.has(idx)) for (let x = x0 + 30; x < x0 + 34; x++) for (let y = Math.round(base(x)); y < Math.round(base(x)) + 10; y++) g[y * W + x] = 30; // опашка
      if (under.has(idx))
        for (let x = x0; x < x0 + wx; x++) {
          const yc = base(x) + 9 + 3 * Math.sin((x - x0) / 4);
          for (let y = Math.round(yc) - 2; y <= Math.round(yc) + 2; y++) g[y * W + x] = 95; // молив: по-светъл от печата
        }
      words.push({ i: idx, t: "worde", x: x0, y: Math.round(base(x0)) - 24, w: wx, h: 24 + (tail.has(idx) ? 10 : 0), line, para: 0, conf: 90 });
      idx++;
    }
  }
  return { g, W, H, words };
}

describe("откриване на подчертано (синтетична страница)", () => {
  const under = new Set([3, 12, 13, 27, 40, 52]);
  const tail = new Set([1, 9, 20, 33, 45, 58]);
  const { g, W, H, words } = page(under, tail);
  const out = withUnderlines(g, W, H, words);
  it("маркира подчертаните думи", () => {
    const hit = [...under].filter((i) => out[i].auto);
    expect(hit.length).toBeGreaterThanOrEqual(5);
  });
  it("не маркира думи без молив, нито такива само с опашки на буквите", () => {
    const wrong = out.filter((w) => w.auto && !under.has(w.i));
    expect(wrong.length).toBeLessThanOrEqual(2);
    for (const i of tail) if (!under.has(i)) expect(out[i].auto).toBe(false);
  });
});

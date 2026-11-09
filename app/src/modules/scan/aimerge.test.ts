import { describe, expect, it } from "vitest";
import { align, mergeAi, parseAiLines } from "./aimerge";
import type { ScanWord } from "./types";

const w = (i: number, t: string, x: number, line = 0): ScanWord => ({ i, t, x, y: 10 + line * 30, w: t.length * 10, h: 20, line, para: 0, conf: 90, score: 0, auto: false, sel: false });

describe("parseAiLines", () => {
  it("маркира подчертаното с [[ ]], и фрази, и през редове", () => {
    const t = parseAiLines(["He decided to [[give up]] his [[job]].", "", "A [[very", "long]] day"]);
    expect(t.map((x) => `${x.t}${x.u ? "*" : ""}`)).toEqual(["He", "decided", "to", "give*", "up*", "his", "job.*", "A", "very*", "long*", "day"]);
    expect(t.find((x) => x.t === "A")!.para).toBe(1);
    expect(t.find((x) => x.t === "day")!.line).toBe(2);
  });
  it("няма останали скоби", () => {
    expect(parseAiLines(["[[ok]] [[two words]]"]).every((x) => !/[\[\]]/.test(x.t))).toBe(true);
  });
});

describe("align", () => {
  it("намира двойките въпреки грешките на OCR и липсващи думи", () => {
    const ai = ["The", "locals", "were", "suspicious", "of", "him"];
    const loc = ["Tho", "locais", "suspicious", "him"];
    expect(align(ai, loc)).toEqual([0, 1, -1, 2, -1, 3]);
  });
});

describe("mergeAi", () => {
  it("текстът е на AI, местата са от Tesseract, подчертаното е избрано", () => {
    const local = [w(0, "Tho", 10), w(1, "locais", 50), w(2, "suspicious", 120), w(3, "him", 240)];
    const r = mergeAi(local, ["The locals were [[suspicious]] of him"], 400, 100);
    expect(r.map((x) => x.t)).toEqual(["The", "locals", "were", "suspicious", "of", "him"]);
    expect(r[3].sel).toBe(true);
    expect(r[3].x).toBe(120);
    expect(r.filter((x) => x.sel)).toHaveLength(1);
    // пропуснатата от Tesseract дума получава разумна кутия след предишната
    expect(r[2].x).toBeGreaterThan(50);
    expect(Number.isNaN(r[4].x)).toBe(false);
  });
  it("работи и без нито една двойка", () => {
    const r = mergeAi([], ["Hello [[world]]"], 400, 100);
    expect(r).toHaveLength(2);
    expect(r[1].sel).toBe(true);
    expect(r.every((x) => x.w > 0 && !Number.isNaN(x.x))).toBe(true);
  });
  it("голяма страница се подрежда бързо", () => {
    const words = Array.from({ length: 700 }, (_, k) => `word${k % 50}x`);
    const local = words.map((t, k) => w(k, t, k * 5, Math.floor(k / 10)));
    const t0 = Date.now();
    mergeAi(local, [words.join(" ")], 4000, 3000);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

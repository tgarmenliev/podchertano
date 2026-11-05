import { describe, expect, it } from "vitest";
import { itemsFromSelection, paragraphs } from "./sentences";
import type { ScanWord } from "./types";

const mk = (text: string, selected: number[] = [], para = 0): ScanWord[] =>
  text.split(" ").map((t, i) => ({ i, t, x: i * 50, y: 0, w: 40, h: 20, line: Math.floor(i / 8), para, conf: 90, score: 0, auto: false, sel: selected.includes(i) }));

describe("избор на думи", () => {
  const text = "Last summer he decided to give up his job. However, after a few months, they began to appreciate his enthusiasm.";
  it("групира съседни избрани думи във фраза и намира изречението", () => {
    const w = mk(text, [5, 6]);
    const items = itemsFromSelection(w);
    expect(items).toHaveLength(1);
    expect(items[0].surface).toBe("give up");
    expect(items[0].sentence).toBe("Last summer he decided to give up his job.");
  });
  it("отделни думи в различни изречения", () => {
    const w = mk(text, [9, 19]); // However, и enthusiasm.
    const items = itemsFromSelection(w);
    expect(items.map((x) => x.surface)).toEqual(["However", "enthusiasm"]);
    expect(items[1].sentence.startsWith("However, after")).toBe(true);
  });
  it("маха пунктуацията по краищата, но пази апострофи", () => {
    const w = mk("He said: \"Don't go.\" Then left.", [2, 3]);
    expect(itemsFromSelection(w)[0].surface).toBe("Don't go");
  });
  it("фраза не пресича ред", () => {
    const w = mk("one two three four five six seven eight nine ten", [7, 8]); // line 0 край, line 1 начало
    expect(itemsFromSelection(w).map((x) => x.surface)).toEqual(["eight", "nine"]);
  });
  it("абзаците се групират по para", () => {
    const a = mk("a b c", [], 0);
    const b = mk("d e", [], 1).map((x, k) => ({ ...x, i: 3 + k }));
    expect(paragraphs([...a, ...b]).map((p) => p.words.length)).toEqual([3, 2]);
  });
});

import { buildLines, mergePasses, type RawWord } from "./layout";

const rw = (t: string, x: number, y: number, conf = 90, w = 60, h = 24): RawWord => ({ t, conf, x, y, w, h });

describe("обединяване на проходи на OCR", () => {
  it("добавя дума, която първият проход е изпуснал", () => {
    const a = [rw("transport", 0, 0), rw("in", 70, 0)];
    const b = [rw("in", 71, 1), rw("Bulgaria", 140, 0)];
    expect(mergePasses([a, b]).map((w) => w.t)).toEqual(["transport", "in", "Bulgaria"]);
  });
  it("не дублира една и съща дума", () => {
    const a = [rw("support", 0, 0)];
    expect(mergePasses([a, [rw("support", 2, 1)], [rw("support", -1, 0)]])).toHaveLength(1);
  });
  it("една голяма кутия срещу две малки: остава първата", () => {
    const a = [rw("ab", 0, 0, 90, 100)];
    const b = [rw("a", 0, 0, 90, 48), rw("b", 52, 0, 90, 48)];
    expect(mergePasses([a, b]).map((w) => w.t)).toEqual(["ab"]);
  });
  it("по-сигурна дума заменя съмнителна на същото място", () => {
    const a = [rw("Ie", 0, 0, 45)];
    const b = [rw("Garmenliev.", 0, 0, 91)];
    expect(mergePasses([a, b])[0].t).toBe("Garmenliev.");
  });
});

describe("редове и абзаци от кутии", () => {
  it("подрежда по ред и по x, и дели абзаци при голям отвор", () => {
    const words = [rw("c", 120, 52), rw("a", 0, 0), rw("b", 60, 2), rw("d", 0, 52), rw("e", 0, 200), rw("f", 60, 201)];
    const out = buildLines(words);
    expect(out.map((w) => w.t)).toEqual(["a", "b", "d", "c", "e", "f"]);
    expect(out.map((w) => w.line)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(out.map((w) => w.para)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(out.map((w) => w.i)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("празен вход", () => {
    expect(buildLines([])).toEqual([]);
  });
});

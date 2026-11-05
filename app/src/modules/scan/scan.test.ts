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

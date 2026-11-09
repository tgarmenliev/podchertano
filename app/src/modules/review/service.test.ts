import { describe, expect, it } from "vitest";

// service.ts тегли базата при зареждане; тестваме само чистите функции
import { interleave, maskSentence, pickDistractors, pickMode } from "./service";

describe("interleave", () => {
  it("след всеки две стари идва една нова", () => {
    expect(interleave(["d1", "d2", "d3", "d4", "d5"], ["n1", "n2"])).toEqual(["d1", "d2", "n1", "d3", "d4", "n2", "d5"]);
  });
  it("само нови или само стари", () => {
    expect(interleave([], ["n1", "n2"])).toEqual(["n1", "n2"]);
    expect(interleave(["d1", "d2", "d3"], [])).toEqual(["d1", "d2", "d3"]);
  });
});

describe("режим", () => {
  it("новата дума се пита с изречение, ако има, иначе по превода", () => {
    expect(pickMode({ state: 0, reps: 0 }, true)).toBe("cloze");
    expect(pickMode({ state: 0, reps: 0 }, false)).toBe("type_from_bg");
  });
  it("cloze маскира думата само като цяла дума", () => {
    expect(maskSentence("He gave up smoking.", "gave up")).toBe("He ___ smoking.");
    expect(maskSentence("The cat sat.", "at")).toBeNull();
  });
});

describe("режими по етап", () => {
  it("нова дума: избор, ако има варианти", () => {
    expect(pickMode({ state: 0, reps: 0 }, true, true)).toBe("choice");
  });
  it("в преговор се редуват писане, изречение и слушане", () => {
    expect(pickMode({ state: 2, reps: 3 }, true)).toBe("type_from_bg");
    expect(pickMode({ state: 2, reps: 4 }, true)).toBe("cloze");
    expect(pickMode({ state: 2, reps: 5 }, true)).toBe("listen");
    expect(pickMode({ state: 2, reps: 4 }, false)).toBe("type_from_bg");
  });
  it("в учене: изречение и избор на смени", () => {
    expect(pickMode({ state: 1, reps: 1 }, true, true)).toBe("choice");
    expect(pickMode({ state: 1, reps: 2 }, true, true)).toBe("cloze");
  });
});

describe("грешни варианти", () => {
  const pool = [
    { target: "big", pos: "adj" }, { target: "large", pos: "adj" }, { target: "tall", pos: "adj" },
    { target: "run", pos: "verb" }, { target: "cat", pos: "noun" }, { target: "fence", pos: "noun" },
  ];
  it("три различни, без верния и без приетите синоними, и най-напред от същия вид", () => {
    const r = pickDistractors("big", ["big", "large"], pool, "adj")!;
    expect(r).toHaveLength(3);
    expect(r).not.toContain("big");
    expect(r).not.toContain("large");
    expect(r).toContain("tall");
  });
  it("null, когато думите не стигат", () => {
    expect(pickDistractors("big", ["big"], pool.slice(0, 3), "adj")).toBeNull();
  });
});

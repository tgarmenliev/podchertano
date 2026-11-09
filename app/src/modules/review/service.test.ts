import { describe, expect, it } from "vitest";

// service.ts тегли базата при зареждане; тестваме само чистите функции
import { interleave, maskSentence, pickMode } from "./service";

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

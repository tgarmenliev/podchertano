import { describe, expect, it } from "vitest";
import { ratingForReading, reviewLogId } from "./service";

describe("оценка за преговор от четене", () => {
  it("докоснатата дума е „не я помня“", () => {
    expect(ratingForReading(true, 0)).toBe(1);
    expect(ratingForReading(true, 2)).toBe(1);
  });
  it("недокоснатата: нова е „трудно“, вече учена е „добре“", () => {
    expect(ratingForReading(false, 0)).toBe(2);
    expect(ratingForReading(false, 1)).toBe(3);
    expect(ratingForReading(false, 2)).toBe(3);
  });
});

describe("стабилен идентификатор на преглед", () => {
  it("един и същ вход дава същия валиден uuid, различен вход друг", () => {
    const a = reviewLogId("r1", "w1");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(reviewLogId("r1", "w1")).toBe(a);
    expect(reviewLogId("r1", "w2")).not.toBe(a);
    expect(reviewLogId("r2", "w1")).not.toBe(a);
  });
});

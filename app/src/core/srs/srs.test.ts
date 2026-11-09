import { describe, expect, it } from "vitest";
import { judge, normalize } from "./answer";
import { dayKey, startOfDay, streak } from "./day";
import { isFast, isKnown, newCardRow, ratingFromResult, review, statusOf } from "./scheduler";

describe("judge", () => {
  it("точно съвпадение, без значение на регистъра и пунктуацията", () => {
    expect(judge("Give up.", ["give up"]).verdict).toBe("correct");
    expect(judge("  GIVE   UP ", ["give up"]).verdict).toBe("correct");
  });
  it("приема и основната форма, и формата от текста", () => {
    expect(judge("repaired", ["repaired", "repair"]).verdict).toBe("correct");
    expect(judge("repair", ["repaired", "repair"]).verdict).toBe("correct");
  });
  it("една буква разлика при дълга дума е „почти“, при къса е грешка", () => {
    expect(judge("suspicius", ["suspicious"]).verdict).toBe("almost");
    expect(judge("cat", ["cut"]).verdict).toBe("wrong");
  });
  it("празно и грешно", () => {
    expect(judge("   ", ["give up"]).verdict).toBe("empty");
    expect(judge("take off", ["give up"]).verdict).toBe("wrong");
  });
  it("нормализира типографски апострофи", () => {
    expect(normalize("Don’t")).toBe("don't");
  });
});

describe("оценка и график", () => {
  it("автоматична оценка", () => {
    expect(ratingFromResult({ verdict: "wrong", hintUsed: false })).toBe(1);
    expect(ratingFromResult({ verdict: "almost", hintUsed: false })).toBe(2);
    expect(ratingFromResult({ verdict: "correct", hintUsed: true })).toBe(2);
    expect(ratingFromResult({ verdict: "correct", hintUsed: false })).toBe(3);
  });
  it("нова карта: вярно отговорена се отдалечава, грешна идва скоро", () => {
    const t0 = new Date("2026-11-04T10:00:00Z");
    const c0 = newCardRow(t0);
    expect(statusOf(c0)).toBe("new");
    const good = review(c0, 3, t0);
    const again = review(c0, 1, t0);
    expect(good.reps).toBe(1);
    expect(good.due.getTime()).toBeGreaterThan(t0.getTime());
    expect(again.due.getTime()).toBeLessThanOrEqual(good.due.getTime());
    expect(statusOf(good)).toBe("learning");
  });
  it("след няколко верни отговора интервалът расте, а грешка добавя lapse", () => {
    let c = newCardRow(new Date("2026-11-01T10:00:00Z"));
    let now = new Date("2026-11-01T10:00:00Z");
    const gaps: number[] = [];
    for (let i = 0; i < 6; i++) {
      c = review(c, 3, now);
      gaps.push(c.due.getTime() - now.getTime());
      now = c.due;
    }
    expect(gaps[5]).toBeGreaterThan(gaps[2]);
    expect(isKnown(c) || c.stability > 5).toBe(true);
    const lapsed = review(c, 1, now);
    expect(lapsed.lapses).toBe(1);
  });
});

describe("дни и серия", () => {
  const tz = "Europe/Sofia";
  it("денят се брои по часовата зона, не по UTC", () => {
    // 23:30 UTC на 4 ноември вече е 5 ноември в София (UTC+2)
    expect(dayKey(new Date("2026-11-04T23:30:00Z"), tz)).toBe("2026-11-05");
  });
  it("началото на деня", () => {
    const s = startOfDay(new Date("2026-11-04T15:00:00Z"), tz);
    expect(s.toISOString()).toBe("2026-11-03T22:00:00.000Z");
  });
  it("серия: поредни дни; днес без преговор не къса серията от вчера", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const r = (iso: string) => new Date(iso);
    expect(streak([r("2026-11-03T09:00:00Z"), r("2026-11-02T09:00:00Z"), r("2026-11-01T09:00:00Z")], tz, now)).toBe(3);
    expect(streak([r("2026-11-04T08:00:00Z"), r("2026-11-03T09:00:00Z")], tz, now)).toBe(2);
    expect(streak([r("2026-11-01T09:00:00Z")], tz, now)).toBe(0);
    expect(streak([], tz, now)).toBe(0);
  });
});

describe("judge: справедлива проверка", () => {
  it("без to и член отпред", () => {
    expect(judge("go", ["to go"]).verdict).toBe("correct");
    expect(judge("to give up", ["give up"]).verdict).toBe("correct");
    expect(judge("the environment", ["environment"]).verdict).toBe("correct");
  });
  it("британски и американски правопис", () => {
    expect(judge("color", ["colour"]).verdict).toBe("correct");
    expect(judge("organise", ["organize"]).verdict).toBe("correct");
    expect(judge("center", ["centre"]).verdict).toBe("correct");
    expect(judge("gray", ["grey"]).verdict).toBe("correct");
  });
  it("не бърка различни думи", () => {
    expect(judge("rise", ["rize"]).verdict).toBe("wrong");
    expect(judge("hour", ["horror"]).verdict).toBe("wrong");
  });
  it("размяна на съседни букви и две грешки при дълга дума е „почти“", () => {
    expect(judge("recieve", ["receive"]).verdict).toBe("almost");
    expect(judge("embarassment", ["embarrassment"]).verdict).toBe("almost");
    expect(judge("acommodation", ["accommodation"]).verdict).toBe("almost");
    expect(judge("catr", ["cart"]).verdict).toBe("wrong");
  });
  it("приема всяка от допустимите думи (напр. синоним от друга карта)", () => {
    expect(judge("large", ["big", "large"]).verdict).toBe("correct");
  });
});

describe("оценка „Лесно“", () => {
  it("бърз верен отговор без подсказка е Лесно, но не при подсказка или грешка", () => {
    expect(ratingFromResult({ verdict: "correct", hintUsed: false, fast: true })).toBe(4);
    expect(ratingFromResult({ verdict: "correct", hintUsed: true, fast: true })).toBe(2);
    expect(ratingFromResult({ verdict: "almost", hintUsed: false, fast: true })).toBe(2);
    expect(ratingFromResult({ verdict: "wrong", hintUsed: false, fast: true })).toBe(1);
  });
  it("прагът расте с дължината на думата", () => {
    expect(isFast(3000, 3)).toBe(true);
    expect(isFast(9000, 3)).toBe(false);
    expect(isFast(5000, 10)).toBe(true);
  });
});

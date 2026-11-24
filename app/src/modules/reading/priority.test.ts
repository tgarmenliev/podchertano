import { describe, expect, it } from "vitest";
import { isBasic, isUsable, jitter, pickReadingWords, score, type Candidate } from "./priority";

const c = (target: string, o: Partial<Candidate> = {}): Candidate => ({ itemId: `id-${target}`, target, pos: "noun", translationBg: "превод", state: 0, stability: 0, lapses: 0, pages: 1, suspended: false, ...o });

describe("кои записи са подходящи", () => {
  it("отхвърля боклук от сканиране и твърде лесни думи", () => {
    expect(isUsable(c("gaunt, stringy"))).toBe(false);
    expect(isUsable(c("be"))).toBe(false);
    expect(isUsable(c("upon"))).toBe(false);
    expect(isUsable(c("a b c d"))).toBe(false);
    expect(isUsable(c("tom (hanks)"))).toBe(false);
    expect(isUsable(c("pupils’ cognitive abilities"))).toBe(true);
    expect(isUsable(c("obtain", { pos: "verb" }))).toBe(true);
    expect(isUsable(c("give it a miss"))).toBe(false); // 4 думи: твърде дълго
    expect(isUsable(c("let your guard down"))).toBe(false);
    expect(isUsable(c("fend off"))).toBe(true);
  });
  it("пропуска спрени и здраво научени думи", () => {
    expect(isUsable(c("cruel", { suspended: true }))).toBe(false);
    expect(isUsable(c("cruel", { state: 2, stability: 30 }))).toBe(false);
    expect(isUsable(c("cruel", { state: 2, stability: 5 }))).toBe(true);
  });
  it("isBasic е само за единични думи", () => {
    expect(isBasic("Be")).toBe(true);
    expect(isBasic("be careful")).toBe(false);
  });
});

describe("оценка", () => {
  it("дума от няколко страници и грешена е над нова, видяна веднъж", () => {
    expect(score(c("obtain", { pages: 3 }))).toBeGreaterThan(score(c("cruel")));
    expect(score(c("cruel", { state: 1, lapses: 2 }))).toBeGreaterThan(score(c("cruel")));
  });
  it("много рядка дума се оценява по-ниско", () => {
    const tier = (w: string) => (w === "iguanodon" ? 70 : 10);
    expect(score(c("iguanodon"), { tierOf: tier })).toBeLessThan(score(c("obtain"), { tierOf: tier }) - 2);
  });
  it("шумът е стабилен за един и същ ключ и различен за различни", () => {
    expect(jitter("2026-11-24|a")).toBe(jitter("2026-11-24|a"));
    expect(jitter("2026-11-24|a")).not.toBe(jitter("2026-11-25|a"));
    expect(jitter("x")).toBeGreaterThanOrEqual(0);
    expect(jitter("x")).toBeLessThan(1);
  });
});

describe("повторение на думи между текстове", () => {
  it("дума от скорошен текст отстъпва на други", () => {
    expect(score(c("cruel", { recentlyRead: true }))).toBeLessThan(score(c("cruel")) - 2);
  });
});

describe("избор на думи", () => {
  const verbs = ["obtain", "ensure", "equip", "endure", "absorb", "preserve", "conceal", "acquire"].map((t) => c(t, { pos: "verb" }));
  const nouns = ["maid", "harbour", "groom", "folk", "pipe"].map((t) => c(t));
  it("връща най-много n, не повече от 4 от една част на речта", () => {
    const r = pickReadingWords([...verbs, ...nouns], { n: 8, seed: "d" })!;
    expect(r.length).toBeLessThanOrEqual(8);
    expect(r.filter((x) => x.pos === "verb").length).toBeLessThanOrEqual(4);
    expect(new Set(r.map((x) => x.target)).size).toBe(r.length);
  });
  it("не включва боклук и лесни думи", () => {
    const r = pickReadingWords([...nouns, c("be"), c("flange, thus"), c("upon"), c("obtain", { pos: "verb" })], { n: 10 })!;
    expect(r.map((x) => x.target)).not.toContain("be");
    expect(r.map((x) => x.target)).not.toContain("flange, thus");
  });
  it("до 3 израза и до 2 много редки", () => {
    const phr = ["fend off", "bump into", "embark upon", "head down", "at first sight"].map((t) => c(t, { pos: "phrasal verb" }));
    const tier = (w: string) => (["a1", "a2", "a3", "a4"].includes(w) ? 70 : 10);
    const rare = ["a1", "a2", "a3", "a4"].map((t) => c(t, { pos: "adj", pages: 4 }));
    const r = pickReadingWords([...phr, ...rare, ...nouns, ...verbs], { n: 10, tierOf: tier })!;
    expect(r.filter((x) => /\s/.test(x.target)).length).toBeLessThanOrEqual(3);
    expect(r.filter((x) => tier(x.target) >= 50).length).toBeLessThanOrEqual(2);
  });
  it("null, ако няма достатъчно думи", () => {
    expect(pickReadingWords([c("obtain"), c("cruel")], { min: 5 })).toBeNull();
  });
  it("един и същ ден дава същия избор, друг ден друг ред при равни оценки", () => {
    const many = Array.from({ length: 20 }, (_, i) => c(`word${String.fromCharCode(97 + i)}${String.fromCharCode(97 + ((i * 7) % 26))}`, { pos: ["noun", "verb", "adj", "adv"][i % 4] }));
    const a = pickReadingWords(many, { n: 8, seed: "2026-11-24" })!.map((x) => x.target);
    const b = pickReadingWords(many, { n: 8, seed: "2026-11-24" })!.map((x) => x.target);
    const d = pickReadingWords(many, { n: 8, seed: "2026-11-25" })!.map((x) => x.target);
    expect(a).toEqual(b);
    expect(a).not.toEqual(d);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetError, assertWithinBudget } from "./budget";
import { aiEnabled, estimateMicroEur } from "./config";
import { enrichWords } from "./enrich";

const okFetch = (content: unknown, usage = { prompt_tokens: 1000, completion_tokens: 500 }) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }], usage }) }) as unknown as Response);

describe("AI е изключен по подразбиране", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("без флаг няма заявки", async () => {
    vi.stubEnv("AI_ENABLED", "");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(aiEnabled()).toBe(false);
    const f = okFetch({ items: [] });
    await expect(enrichWords({ items: [{ id: 0, surface: "x", sentence: "x" }] }, { fetch: f as never })).rejects.toThrow("AI е изключен");
    expect(f).not.toHaveBeenCalled();
  });
  it("флагът без ключ също не пуска", () => {
    vi.stubEnv("AI_ENABLED", "1");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(aiEnabled()).toBe(false);
  });
});

describe("обогатяване (с имитиран отговор)", () => {
  const req = { items: [{ id: 0, surface: "give up", sentence: "He decided to give up his job." }, { id: 1, surface: "suspicious", sentence: "The locals were suspicious." }] };
  it("валидира и връща думите + цена", async () => {
    const f = okFetch({ items: [
      { id: 0, lemma: "give up", pos: "phrasal verb", phrase: "give up", translation_bg: "отказвам се", translation_alt_bg: null, meaning_bg: "спирам да правя нещо", example_en: "Never give up." },
      { id: 1, lemma: "suspicious", pos: "adj", phrase: null, translation_bg: "подозрителен", translation_alt_bg: "съмнителен", meaning_bg: null, example_en: null },
      { id: 99, lemma: "ghost", pos: "noun", phrase: null, translation_bg: "призрак", translation_alt_bg: null, meaning_bg: null, example_en: null },
    ] });
    const r = await enrichWords(req, { fetch: f as never, apiKey: "test", model: "gpt-6.1-terra" });
    expect(r.items.map((i) => i.id)).toEqual([0, 1]); // непознатото id се отхвърля
    expect(r.estCostMicroEur).toBe(estimateMicroEur("gpt-6.1-terra", 1000, 500));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("невалиден отговор е грешка, не гадаене", async () => {
    const f = okFetch({ items: [{ id: 0, lemma: "x" }] });
    await expect(enrichWords(req, { fetch: f as never, apiKey: "t" })).rejects.toThrow("неясен");
  });
  it("грешка на услугата не показва вътрешности", async () => {
    const f = vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: "secret key sk-123 invalid" } }) }) as unknown as Response);
    await expect(enrichWords(req, { fetch: f as never, apiKey: "t" })).rejects.toThrow("Услугата за превод не отговори");
  });
  it("твърде много думи се отказват", async () => {
    const big = { items: Array.from({ length: 41 }, (_, i) => ({ id: i, surface: "a", sentence: "a" })) };
    await expect(enrichWords(big, { fetch: okFetch({ items: [] }) as never, apiKey: "t" })).rejects.toThrow("Твърде много");
  });
});

describe("лимити", () => {
  const limits = { perUserDaily: 3, monthlyCapEur: 5 };
  it("пуска под лимитите", () => {
    expect(() => assertWithinBudget({ usedTodayByUser: 2, usedMonthMicroEur: 1_000_000 }, limits)).not.toThrow();
  });
  it("дневен лимит", () => {
    expect(() => assertWithinBudget({ usedTodayByUser: 3, usedMonthMicroEur: 0 }, limits)).toThrow(BudgetError);
  });
  it("месечен таван (прекъсвач), включително предварителна оценка", () => {
    expect(() => assertWithinBudget({ usedTodayByUser: 0, usedMonthMicroEur: 5_000_000 }, limits)).toThrow(BudgetError);
    expect(() => assertWithinBudget({ usedTodayByUser: 0, usedMonthMicroEur: 4_980_000 }, limits, 50_000)).toThrow(BudgetError);
  });
  it("цена: консервативна оценка", () => {
    expect(estimateMicroEur("gpt-6.1-terra", 1_000_000, 0)).toBe(1_000_000); // 1 USD = 1 000 000 микро
    expect(estimateMicroEur("unknown-model", 1000, 1000)).toBe(60_000);
  });
});

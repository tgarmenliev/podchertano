import { describe, expect, it, vi } from "vitest";
import { buildReadingPrompt, findForm, generateReading, validateReading } from "./reading";

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${"abcdefghij"[i % 10]}`).join(" ");
// текст от ~200 думи, в който са „obtained“ и „fend off“, „harbour“, „groom“
const text1 = `The old man had obtained a small boat. ${para(60)}.`;
const text2 = `Every evening the crew tried to fend off the cold wind near the harbour. ${para(60)}.`;
const text3 = `The groom waited by the gate, and nobody spoke. ${para(60)}.`;
const body = [text1, text2, text3].join("\n\n");
const q = (n: number, ev: string) => ({ q: `Question number ${n}?`, options: [`a${n}`, `b${n}`, `c${n}`, `d${n}`], answer: n % 4, evidence: ev, why_bg: "защото е така" });
const good = () => ({
  title: "A cold evening",
  paragraphs: [text1, text2, text3],
  used: [{ id: 0, form: "obtained" }, { id: 1, form: "fend off" }, { id: 2, form: "harbour" }, { id: 3, form: "groom" }],
  questions: [1, 2, 3, 4, 5].map((n) => q(n, "The old man had obtained a small boat.")),
});

describe("findForm", () => {
  it("намира цяла дума, не част от друга", () => {
    expect(findForm("He is a groomed man", "groom")).toBeNull();
    expect(findForm("The groom came", "groom")).toEqual({ start: 4, end: 9 });
    expect(findForm("They FEND OFF it", "fend off")).not.toBeNull();
  });
});

describe("validateReading", () => {
  it("приема добър отговор", () => {
    const v = validateReading(good(), [0, 1, 2, 3]);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.reading.questions).toHaveLength(5);
      expect(v.missing).toEqual([]);
    }
  });
  it("маха дума, която не е в текста, но допуска до 2 липсващи", () => {
    const g = good();
    g.used.push({ id: 4, form: "elephant" }); // няма я в текста
    const v = validateReading(g, [0, 1, 2, 3, 4, 5]);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.missing).toEqual([4, 5]);
  });
  it("грешка, ако липсват твърде много думи", () => {
    const g = good();
    g.used = [{ id: 0, form: "obtained" }];
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(false);
  });
  it("маха въпрос с цитат, който го няма в текста, и пада при по-малко от 4 годни", () => {
    const g = good();
    g.questions[0].evidence = "This sentence is not in the text at all.";
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(true); // 4 останали
    g.questions[1].evidence = "Another invented sentence here.";
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(false);
  });
  it("маха въпрос с повтарящи се варианти", () => {
    const g = good();
    g.questions[0].options = ["same", "Same", "c", "d"];
    g.questions[1].options = ["x", "y", "z", "z"];
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(false); // останаха 3
  });
  it("отхвърля форматиране, твърде къс текст и грешна схема", () => {
    const g = good();
    g.paragraphs[0] += " **bold**";
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(false);
    const short = { ...good(), paragraphs: ["Too short.", "Really short."] };
    expect(validateReading(short, [0, 1, 2, 3]).ok).toBe(false);
    expect(validateReading({ nope: 1 }, [0]).ok).toBe(false);
    const bad = good();
    bad.questions[0].answer = 7;
    expect(validateReading(bad, [0, 1, 2, 3]).ok).toBe(false);
  });
  it("цитатът се сравнява без значение на кавички и интервали", () => {
    const g = good();
    g.questions.forEach((x) => (x.evidence = "The   old man had obtained a small boat."));
    expect(validateReading(g, [0, 1, 2, 3]).ok).toBe(true);
  });
  void body;
});

const resp = (content: unknown, usage = { prompt_tokens: 900, completion_tokens: 1400 }) =>
  ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }], usage }) }) as unknown as Response;
const items = [{ id: 0, target: "obtain", pos: "verb", bg: "получавам" }, { id: 1, target: "fend off", pos: "phrasal verb", bg: "отблъсквам" }, { id: 2, target: "harbour", pos: "noun", bg: "пристанище" }, { id: 3, target: "groom", pos: "noun", bg: "коняр" }];

describe("generateReading", () => {
  it("връща проверен текст и сметка", async () => {
    const f = vi.fn(async () => resp(good()));
    const r = await generateReading(items, { fetch: f as never, apiKey: "k" });
    expect(r.attempts).toBe(1);
    expect(r.tokensIn).toBe(900);
    expect(r.estCostMicroEur).toBeGreaterThan(0);
  });
  it("при лош първи отговор пробва втори път и събира цената", async () => {
    const f = vi.fn().mockResolvedValueOnce(resp({ nope: 1 })).mockResolvedValueOnce(resp(good()));
    const r = await generateReading(items, { fetch: f as never, apiKey: "k" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.attempts).toBe(2);
    expect(r.tokensIn).toBe(1800);
  });
  it("след два лоши отговора хвърля грешка с причина и цена", async () => {
    const f = vi.fn(async () => resp({ nope: 1 }));
    await expect(generateReading(items, { fetch: f as never, apiKey: "k" })).rejects.toMatchObject({ message: expect.stringContaining("Опитай пак"), costMicroEur: expect.any(Number) });
  });
  it("не праща нищо без ключ/флаг", async () => {
    const f = vi.fn();
    await expect(generateReading(items, { fetch: f as never })).rejects.toThrow("AI е изключен");
    expect(f).not.toHaveBeenCalled();
  });
  it("промптът съдържа думите и изискването за точен цитат", () => {
    const p = buildReadingPrompt(items);
    expect(p).toContain('"target":"fend off"');
    expect(p).toContain("EXACTLY");
    expect(p).toContain("main idea");
    expect(p).toContain("means in the text");
  });
});

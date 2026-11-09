import { describe, expect, it } from "vitest";
import { buildDict, correctToken, correctWords } from "./spell";

const dict = buildDict({
  "10": ["last", "news", "have", "read", "there", "their", "form", "home", "ready", "than", "them", "then"],
  "20": ["gentleman", "inquiries", "advice", "service"],
  "35": ["theorising", "theorizing"],
  "50": ["imprudent"],
});

describe("консервативна корекция на OCR", () => {
  it("поправя ясна грешка с един кандидат", () => {
    expect(correctToken("gontlemas", 80, dict)).toBe("gentleman");
    expect(correctToken("nave", 70, dict)).toBe("have");
  });
  it("не пипа думи от речника, нито британски правопис", () => {
    expect(correctToken("theorising", 60, dict)).toBeNull();
    expect(correctToken("inquiries", 60, dict)).toBeNull();
  });
  it("не пипа къси думи, имена, апострофи и цифри", () => {
    expect(correctToken("ews", 60, dict)).toBeNull();
    expect(correctToken("Holmes", 60, dict)).toBeNull();
    expect(correctToken("don't", 60, dict)).toBeNull();
    expect(correctToken("1rea", 60, dict)).toBeNull();
  });
  it("не пипа, когато OCR е много сигурен (рядка дума или име)", () => {
    expect(correctToken("nave", 95, dict)).toBeNull();
  });
  it("не поправя при двусмислие", () => {
    // „thar“ е на една редакция от „than“ и „that“, ако и двете са еднакво чести
    const d = buildDict({ "10": ["than", "that"] });
    expect(correctToken("thaq", 60, d)).toBeNull();
  });
  it("пази пунктуацията около думата", () => {
    const r = correctWords([{ t: "(gontlemas,", conf: 70 }, { t: "Mortimer", conf: 60 }, { t: "last", conf: 90 }], dict);
    expect(r.words.map((w) => w.t)).toEqual(["(gentleman,", "Mortimer", "last"]);
    expect(r.fixes).toEqual([{ from: "(gontlemas,", to: "(gentleman," }]);
  });
});

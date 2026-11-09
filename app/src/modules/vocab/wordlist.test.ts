import { describe, expect, it } from "vitest";
import { MAX_BATCH, parseWordList } from "./wordlist";

describe("parseWordList", () => {
  it("ред, запетая и точка и запетая; изразите остават цели", () => {
    expect(parseWordList("reckon, sturdy;give up\nbumpers").words).toEqual(["reckon", "sturdy", "give up", "bumpers"]);
  });
  it("маха номера, тирета и дубликати", () => {
    expect(parseWordList("1. reckon\n- Reckon\n2) sturdy\n• casing").words).toEqual(["reckon", "sturdy", "casing"]);
  });
  it("празни редове и твърде дълги записи се пропускат", () => {
    expect(parseWordList("\n\n a \n" + "x".repeat(70)).words).toEqual(["a"]);
  });
  it("ограничава броя и казва колко са останали", () => {
    const r = parseWordList(Array.from({ length: MAX_BATCH + 3 }, (_, i) => `w${i}`).join("\n"));
    expect(r.words).toHaveLength(MAX_BATCH);
    expect(r.dropped).toBe(3);
  });
});

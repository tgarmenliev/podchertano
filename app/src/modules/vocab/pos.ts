export const POS: Record<string, string> = {
  noun: "съществително",
  verb: "глагол",
  adj: "прилагателно",
  adv: "наречие",
  "phrasal verb": "фразов глагол",
  idiom: "израз",
  other: "друго",
};
export const posLabel = (p: string) => POS[p] ?? p;

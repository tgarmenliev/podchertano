// Фалшив „текст“ за тестове: прави валиден отговор по списъка с думи в заявката (без платени заявки).
export function fakeReading(prompt) {
  const glossary = JSON.parse(prompt.slice(prompt.lastIndexOf("TARGET WORDS (")).split("\n").slice(1).join("\n"));
  const filler = "The weather was calm and the people in the small town were kind to each other. ".repeat(1);
  const paras = [];
  const sentences = glossary.map((g, i) => `On day ${i + 1} Tom wrote about the ${g.target} in his notebook and smiled.`);
  paras.push(sentences.slice(0, Math.ceil(sentences.length / 2)).join(" ") + " " + filler.repeat(3));
  paras.push(sentences.slice(Math.ceil(sentences.length / 2)).join(" ") + " " + filler.repeat(4));
  paras.push(("In the evening everyone went home and talked about the day. " + filler).repeat(3));
  const ev = sentences[0];
  const q = (n) => ({ q: `What did Tom do on day ${n}?`, options: ["He slept", "He wrote in his notebook", "He ran away", "He sang loudly"], answer: 1, evidence: ev, why_bg: "Той пише в тетрадката си." });
  return { title: "Tom and the notebook", paragraphs: paras, used: glossary.map((g) => ({ id: g.id, form: g.target })), questions: [1, 2, 3, 4, 5].map(q) };
}

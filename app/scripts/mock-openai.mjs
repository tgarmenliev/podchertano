// Фалшив сървър, който прилича на OpenAI, за тестване на екраните без платени заявки.
// Употреба: node scripts/mock-openai.mjs  (порт 4010), после OPENAI_BASE_URL=http://localhost:4010
import http from "node:http";
let calls = 0;
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls++;
    const content = JSON.parse(body).messages[0].content;
    if (Array.isArray(content)) {
      // чете страница (снимка): фалшив отговор
      console.log(`заявка ${calls}: четене на страница`);
      setTimeout(() => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines: ["The locals were [[suspicious]] of him.", "He decided to [[give up]] his job.", "", "It was a very quiet evening in the small town."] }) } }], usage: { prompt_tokens: 1800, completion_tokens: 120 } }));
      }, 800);
      return;
    }
    const prompt = content;
    const items = JSON.parse(prompt.slice(prompt.indexOf("Items:\n") + 7));
    console.log(`заявка ${calls}: ${items.length} думи`);
    setTimeout(() => {
      const out = items.map((i) => ({ id: i.id, lemma: i.surface.toLowerCase(), pos: "noun", phrase: i.surface.includes(" ") ? i.surface.toLowerCase() : null, translation_bg: i.avoid?.length ? `друго значение ${i.avoid.length} на ${i.surface}` : `превод на ${i.surface}`, translation_alt_bg: "друг превод", meaning_bg: `Значение на „${i.surface}“ в този контекст.`, example_en: `Example with ${i.surface}.` }));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: out }) } }], usage: { prompt_tokens: 300, completion_tokens: 100 } }));
    }, 1500);
  });
}).listen(4010, () => console.log("mock OpenAI на :4010"));

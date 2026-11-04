// Конвейер C: OCR (Tesseract) дава редове и думи; за всеки ред изрязваме снимка и питаме визуален модел
// кои от номерираните думи имат ръчно нарисувана линия отдолу.
// Употреба: node pipeline-c.mjs <папка> <модел> [паралелни=6]
import sharp from "sharp";
import fs from "node:fs";
import { ocrTsv } from "./pipeline-b.mjs";

for (const l of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim();
}
const [dir, model, par = "6"] = process.argv.slice(2);
const KEY = process.env.OPENAI_API_KEY;

const PROMPT = (words) => `This image is a crop of ONE printed text line from a photographed book page. A student may have hand-underlined some words with a thin, wavy pencil line drawn just BELOW the printed text.
The printed words of this line, in order, are:
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}

Return JSON only: {"underlined": [numbers]} listing the words that have a hand-drawn pencil line under them (a line spanning several adjacent words means all of them). The printed letters themselves, table borders, and the descenders of letters like g, y, p are NOT underlines. If none, return {"underlined": []}.`;

async function askAnthropic(buf, words) {
  const body = { model, max_tokens: 400, messages: [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } },
    { type: "text", text: PROMPT(words) + "\nAnswer with the JSON object only, no other text." },
  ] }] };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.type === "error") { if (attempt === 3) throw new Error(String(j.error?.message).replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")); await new Promise((s) => setTimeout(s, 2000 * (attempt + 1))); continue; }
    let idx = []; try { idx = JSON.parse((j.content.find((c) => c.type === "text")?.text ?? "{}").match(/\{[\s\S]*\}/)[0]).underlined ?? []; } catch {}
    return { idx, usage: { prompt_tokens: j.usage?.input_tokens, completion_tokens: j.usage?.output_tokens } };
  }
}

async function ask(buf, words) {
  if (model.startsWith("claude")) return askAnthropic(buf, words);
  const body = {
    model,
    messages: [{ role: "user", content: [
      { type: "text", text: PROMPT(words) },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + buf.toString("base64"), detail: "high" } },
    ] }],
    response_format: { type: "json_object" },
    ...(process.env.EFFORT ? { reasoning_effort: process.env.EFFORT } : {}),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.error) { if (attempt === 2) throw new Error(j.error.message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")); await new Promise((s) => setTimeout(s, 1500)); continue; }
    let idx = []; try { idx = JSON.parse(j.choices[0].message.content).underlined ?? []; } catch {}
    return { idx, usage: j.usage };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

const result = {}; let tin = 0, tout = 0, calls = 0;
const t0 = Date.now();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort()) {
  const path = `${dir}/${f}`;
  const words = ocrTsv(path);
  const meta = await sharp(path).metadata();
  const lines = new Map();
  for (const w of words) { if (!lines.has(w.line)) lines.set(w.line, []); lines.get(w.line).push(w); }
  const jobs = [...lines.values()].filter((l) => l.length >= 1).map((l) => l.sort((a, b) => a.left - b.left));
  const res = await pool(jobs, +par, async (ws) => {
    const x0 = Math.max(0, Math.min(...ws.map((w) => w.left)) - 12), x1 = Math.min(meta.width, Math.max(...ws.map((w) => w.left + w.w)) + 12);
    const hMed = ws.map((w) => w.h).sort((a, b) => a - b)[Math.floor(ws.length / 2)];
    const y0 = Math.max(0, Math.min(...ws.map((w) => w.top)) - 6), y1 = Math.min(meta.height, Math.max(...ws.map((w) => w.top + w.h)) + Math.round(hMed * 0.9));
    const buf = await sharp(path).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).jpeg({ quality: 90 }).toBuffer();
    const r = await ask(buf, ws.map((w) => w.text));
    calls++; tin += r.usage?.prompt_tokens ?? 0; tout += r.usage?.completion_tokens ?? 0;
    return ws.map((w, i) => ({ text: w.text, left: w.left, top: w.top, w: w.w, h: w.h, flag: r.idx.includes(i + 1) }));
  });
  result[f] = res.flat();
  console.log(f, "lines", jobs.length, "flagged", result[f].filter((w) => w.flag).length);
}
fs.mkdirSync("data/c", { recursive: true });
fs.writeFileSync(`data/c/${model}${process.env.EFFORT ? "-" + process.env.EFFORT : ""}.json`, JSON.stringify(result, null, 1));
console.log(`модел ${model}: ${calls} заявки, вход ${tin} токена, изход ${tout} токена, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

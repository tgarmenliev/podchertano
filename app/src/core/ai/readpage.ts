import { z } from "zod";
import { aiEnabled, aiLimits, estimateMicroEur } from "./config";

/*
  AI чете снимката на страницата: преписва печатния текст ред по ред и отбелязва с [[ ]] думите,
  подчертани с молив. Една заявка на страница (около 1–2 цента). Изходът е JSON и се валидира.
*/
export const READ_PROMPT_VERSION = "readpage.v1";

export const READ_PROMPT = `This is a photo of a printed English textbook page (a student is preparing for an English exam). Transcribe the printed English text exactly as it appears, line by line, in reading order. Include headings, body text and exercise text; skip page numbers and decorative elements.
The student may have hand-underlined words or phrases with a pencil, usually a thin wavy or straight line drawn just below the printed words. Wrap every hand-underlined word or contiguous underlined phrase in double square brackets, for example: He decided to [[give up]] his [[job]].
Mark ONLY real hand-drawn pencil underlines. Do not mark printed underlines, table borders, bold or italic text, or the tails of letters like g, y, p.
Do not correct spelling, do not translate, do not add words. Put an empty string between paragraphs.
Return JSON only: {"lines": ["first line", "second line", ...]} with one array item per printed line.`;

export const readSchema = z.object({ lines: z.array(z.string().max(600)).min(1).max(400) });

export type ReadResult = { lines: string[]; model: string; tokensIn: number; tokensOut: number; estCostMicroEur: number };
type Deps = { fetch?: typeof fetch; apiKey?: string; model?: string };

export async function readPage(jpeg: Buffer, deps: Deps = {}): Promise<ReadResult> {
  if (!aiEnabled() && !deps.apiKey) throw new Error("AI е изключен");
  const model = deps.model ?? aiLimits().model;
  const res = await (deps.fetch ?? fetch)(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com"}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.apiKey ?? process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: READ_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
    }),
  });
  const j = (await res.json()) as { error?: { message: string }; choices?: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
  if (!res.ok || j.error) throw new Error("Услугата за четене не отговори. Ползвам четенето в телефона.");
  let parsed;
  try {
    parsed = readSchema.parse(JSON.parse(j.choices?.[0]?.message.content ?? ""));
  } catch {
    throw new Error("Получих неясен отговор. Ползвам четенето в телефона.");
  }
  const tokensIn = j.usage?.prompt_tokens ?? 0;
  const tokensOut = j.usage?.completion_tokens ?? 0;
  return { lines: parsed.lines, model, tokensIn, tokensOut, estCostMicroEur: estimateMicroEur(model, tokensIn, tokensOut) };
}

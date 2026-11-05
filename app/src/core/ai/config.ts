/*
  AI е ИЗКЛЮЧЕН по подразбиране. Включва се само с AI_ENABLED=1 (и ключ) в средата.
  Във Vercel Production тази променлива не е зададена, затова нищо не се изпраща към платени услуги.
*/
export const aiEnabled = () => process.env.AI_ENABLED === "1" && !!process.env.OPENAI_API_KEY;

export const aiLimits = () => ({
  /** заявки на потребител на ден (превод на страница = няколко заявки по 5 думи; докосване на дума = 1) */
  perUserDaily: Number(process.env.AI_DAILY_LIMIT ?? 60),
  /** твърд месечен таван за целия сайт, в евро (прекъсвач) */
  monthlyCapEur: Number(process.env.AI_MONTHLY_CAP_EUR ?? 5),
  model: process.env.AI_ENRICH_MODEL ?? "gpt-6.1-terra",
});

/** Цена на 1M токена в USD (вход, изход). Публични цени към 2026-11-04; проверявай преди увеличаване на лимитите. */
export const PRICES_USD_PER_M: Record<string, { in: number; out: number }> = {
  "gpt-6.1-terra": { in: 1, out: 5 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "gpt-6.1-sol": { in: 2, out: 10 },
};

/** Консервативна оценка в микро-евро (1 USD броим като 1 EUR, за да не подценяваме). */
export function estimateMicroEur(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES_USD_PER_M[model] ?? { in: 10, out: 50 }; // непознат модел: най-скъпата цена
  return Math.ceil(tokensIn * p.in + tokensOut * p.out); // (tokens/1e6 * price) USD * 1e6 micro = tokens * price
}

// Един пробен превод (≈1 цент) с истинския ключ, за да видим качеството. Пускай само с разрешение.
import { enrichWords } from "../src/core/ai/enrich";
const items = [
  ["support", "It aims to improve the passenger experience and support the digitalisation of railway transport in Bulgaria through real-time train information."],
  ["transport", "It aims to improve the passenger experience and support the digitalisation of railway transport in Bulgaria through real-time train information."],
  ["mobile applications", "The project includes a web platform and mobile applications for iOS and Android devices, as well as an energy-efficient e-ink information display."],
  ["internal selection,", "April 2026 – 31 October 2027 (ongoing support), including TU-Sofia internal selection, participation in the EUt+ Incubation Programme #2, mentoring."],
  ["preparation", "Pitch preparation and presentation coaching for the semi-final and final stages of the Incubation Programme."],
  ["entrepreneurial", "Exposure to an international EUt+ entrepreneurial environment and feedback from academic mentors."],
  ["identification", "Support for visibility, ecosystem connections and identification of follow-up opportunities, including further validation, funding, partnerships."],
  ["further validation,", "Support for visibility, ecosystem connections and identification of follow-up opportunities, including further validation, funding, partnerships."],
].map(([surface, sentence], id) => ({ id, surface, sentence }));
const r = await enrichWords({ items }, { apiKey: process.env.OPENAI_API_KEY });
for (const i of r.items) console.log(`${items[i.id].surface.padEnd(22)} → ${i.translation_bg}${i.translation_alt_bg ? " / " + i.translation_alt_bg : ""} | ${i.pos} | ${i.lemma}${i.phrase ? " [" + i.phrase + "]" : ""}\n      ${i.meaning_bg ?? ""}\n      ${i.example_en ?? ""}`);
console.log(`\nмодел ${r.model}: ${r.tokensIn} токена вход, ${r.tokensOut} изход, оценка ≈ ${(r.estCostMicroEur / 1e6).toFixed(4)} евро; върнати ${r.items.length} от ${items.length}`);

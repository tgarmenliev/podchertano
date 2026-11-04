// Прави код за покана. Употреба: pnpm invite [макс_използвания=1] [бележка]
import { randomInt } from "node:crypto";
import { db } from "../src/core/db";
import { invites } from "../src/core/db/schema";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без объркващи O/0, I/1
const code = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
const maxUses = Number(process.argv[2] ?? 1);
const note = process.argv.slice(3).join(" ") || null;
await db.insert(invites).values({ code, maxUses, note });
console.log(`Код за покана: ${code.slice(0, 5)}-${code.slice(5)}  (използвания: ${maxUses}${note ? ", " + note : ""})`);
process.exit(0);

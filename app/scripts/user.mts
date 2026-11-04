// Управление на потребителите (само собственикът, от лаптопа си).
//   pnpm user:create <име> [--owner]   нов акаунт; печата временна парола (само веднъж)
//   pnpm user:reset <име>              нова временна парола (ако е забравил)
//   pnpm user:list                     всички акаунти
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "../src/core/auth/auth";
import { db } from "../src/core/db";
import { profiles, user } from "../src/core/db/schema";

const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без объркващи l, 1, O, 0
const genPassword = () => Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join("");
const [cmd, nameArg, ...flags] = process.argv.slice(2);
const ctx = await auth.$context;

if (cmd === "create") {
  const name = (nameArg ?? "").toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(name)) throw new Error("Името трябва да е 3–30 знака: малки латински букви, цифри, _ или .");
  const [exists] = await db.select().from(user).where(eq(user.username, name));
  if (exists) throw new Error(`Потребител „${name}“ вече съществува`);
  const password = genPassword();
  const created = await ctx.internalAdapter.createUser({ email: `${name}@podchertano.invalid`, name, username: name, emailVerified: true }, undefined as never);
  await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: await ctx.password.hash(password) });
  if (flags.includes("--owner")) await db.update(profiles).set({ role: "owner" }).where(eq(profiles.id, created.id));
  console.log(`Създаден: ${name}${flags.includes("--owner") ? " (собственик)" : ""}\nВременна парола: ${password}\nПредай я лично и му кажи да я смени от Настройки.`);
} else if (cmd === "reset") {
  const [u] = await db.select().from(user).where(eq(user.username, (nameArg ?? "").toLowerCase()));
  if (!u) throw new Error("Няма такъв потребител");
  const password = genPassword();
  await ctx.internalAdapter.updatePassword(u.id, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(u.id); // излиза от всички устройства
  console.log(`Нова временна парола за ${u.username}: ${password}`);
} else if (cmd === "list") {
  const rows = await db.select({ username: user.username, role: profiles.role, status: profiles.status, created: user.createdAt }).from(user).leftJoin(profiles, eq(profiles.id, user.id));
  console.table(rows);
} else {
  console.log("Употреба: pnpm user:create <име> [--owner] | pnpm user:reset <име> | pnpm user:list");
}
process.exit(0);

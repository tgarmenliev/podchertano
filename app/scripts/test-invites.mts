// Интеграционен тест на покани срещу реална (локална) база. Употреба: DATABASE_URL=... tsx scripts/test-invites.ts
import { db } from "../src/core/db";
import { invites, profiles, user } from "../src/core/db/schema";
import { redeemInvite } from "../src/core/invites/redeem";
import { eq, inArray } from "drizzle-orm";

const assert = (c: boolean, m: string) => { if (!c) { console.error("ПРОВАЛ:", m); process.exit(1); } console.log("ok  ", m); };

const TEST_USERS = ["u1", "u2", "u3", "u4", "u5"];
const TEST_CODES = ["ABCDEF12", "EXPIRED99", "MANY12345"];
async function cleanup() {
  await db.delete(user).where(inArray(user.id, TEST_USERS)); // профили и използвания се трият каскадно
  await db.delete(invites).where(inArray(invites.code, TEST_CODES));
}
await cleanup();

async function mkUser(id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  await db.insert(profiles).values({ id });
}
await mkUser("u1"); await mkUser("u2"); await mkUser("u3"); await mkUser("u4");
await db.insert(invites).values([
  { code: "ABCDEF12", maxUses: 1 },
  { code: "EXPIRED99", maxUses: 5, expiresAt: new Date(Date.now() - 1000) },
  { code: "MANY12345", maxUses: 3 },
]);

assert((await redeemInvite("u1", "xx")).ok === false, "твърде къс код е невалиден");
assert((await redeemInvite("u1", "NOSUCH123")) .ok === false, "несъществуващ код е невалиден");
assert((await redeemInvite("u1", "expired-99")).ok === false, "изтекъл код се отказва");
assert((await redeemInvite("u1", "abcd ef-12")).ok === true, "валиден код (нормализиран) се приема");
assert((await db.select().from(profiles).where(eq(profiles.id, "u1")))[0].status === "active", "профилът става active");
assert((await redeemInvite("u1", "whatever")).ok === true, "активен потребител не се проверява отново");
const r = await redeemInvite("u2", "ABCDEF12");
assert(!r.ok && r.reason === "exhausted", "код с max_uses=1 не може втори път");
// едновременно: 3 потребителя срещу код с 3 използвания + още един => точно 3 успеха
await mkUser("u5");
const res = await Promise.all(["u2", "u3", "u4", "u5"].map((u) => redeemInvite(u, "MANY12345")));
assert(res.filter((x) => x.ok).length === 3, "при едновременни заявки точно 3 успяват");
assert((await db.select().from(invites).where(eq(invites.code, "MANY12345")))[0].usedCount === 3, "used_count е 3");
await cleanup();
console.log("ВСИЧКО МИНА (тестовите данни са изтрити)");
process.exit(0);

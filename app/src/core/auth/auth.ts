import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { db } from "@/core/db";
import * as schema from "@/core/db/schema";

/*
  Вход с потребителско име и парола. Регистрация отвън НЕ е възможна (disableSignUp):
  акаунтите ги създава собственикът със скрипта `pnpm user:create`.
  Смяна на парола: в Настройки (нужна е сегашната). Забравена парола: `pnpm user:reset`.
*/
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30, displayUsername: false })],
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 дни: ученикът не бива да се вписва всеки ден
    updateAge: 60 * 60 * 24,
    // подписан „бисквитен“ кеш на сесията: повечето заявки не питат базата за вход
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    storage: "database", // на Vercel има много екземпляри; паметта не стига
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/username": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // само собственикът създава акаунти, затова профилът е активен веднага
          await db
            .insert(schema.profiles)
            .values({ id: user.id, displayName: user.name ?? null, status: "active", role: "student" })
            .onConflictDoNothing();
        },
      },
    },
  },
});

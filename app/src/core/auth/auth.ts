import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "@/core/db";
import * as schema from "@/core/db/schema";

/*
  Вход само с Google. Профилът (profiles) се създава при първия вход със статус „pending“;
  става „active“ чак след валидна покана. Собственикът (OWNER_EMAIL) е активен веднага.
*/
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 дни: учениците не бива да се вписват всеки ден
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const owner = !!process.env.OWNER_EMAIL && user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase();
          await db
            .insert(schema.profiles)
            .values({
              id: user.id,
              displayName: user.name ?? null,
              status: owner ? "active" : "pending",
              role: owner ? "owner" : "student",
            })
            .onConflictDoNothing();
        },
      },
    },
  },
});

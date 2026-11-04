import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/*
  Връзка с Neon Postgres. Съветът на Neon за Vercel: node-postgres + attachDatabasePool
  (Vercel Fluid compute затваря връзките на празен ход). Нужен е „pooled“ адресът (DATABASE_URL).
  Създава се лениво, за да не гърми build без DATABASE_URL.
*/
let _db: ReturnType<typeof create> | undefined;

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Липсва DATABASE_URL (виж .env.example)");
  // pg v8 ще смени значението на sslmode=require; изрично искаме поведението на libpq (без предупреждение)
  const cs = /sslmode=require/.test(connectionString) && !/uselibpqcompat/.test(connectionString) ? `${connectionString}&uselibpqcompat=true` : connectionString;
  const pool = new Pool({ connectionString: cs, max: 10 });
  attachDatabasePool(pool);
  return drizzle(pool, { schema });
}

export const db = new Proxy({} as ReturnType<typeof create>, {
  get(_t, prop) {
    _db ??= create();
    return Reflect.get(_db, prop);
  },
});

export * as tables from "./schema";

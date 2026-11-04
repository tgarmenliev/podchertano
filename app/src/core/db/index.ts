import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/*
  Връзка с Postgres (Neon). Нужен е „pooled“ адресът; prepare:false е за пулера.
  Създава се лениво, за да не гърми build без DATABASE_URL.
*/
let _db: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Липсва DATABASE_URL (виж .env.example)");
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export const db = new Proxy({} as ReturnType<typeof create>, {
  get(_t, prop) {
    _db ??= create();
    return Reflect.get(_db, prop);
  },
});

export * as tables from "./schema";

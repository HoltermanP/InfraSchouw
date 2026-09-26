import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Single pg Pool per server instance (Neon pooled connection string).
 * node-postgres is used instead of the Neon HTTP driver because the app needs
 * interactive transactions (sync, report versions) and runs on the Node.js
 * runtime (Vercel Fluid compute).
 */
type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __infraschouwPool?: Pool; __infraschouwDb?: Db };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt. Zie .env.example.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function getDb(): Db {
  if (!globalForDb.__infraschouwDb) {
    globalForDb.__infraschouwPool = createPool();
    globalForDb.__infraschouwDb = drizzle(globalForDb.__infraschouwPool, { schema, casing: "snake_case" });
  }
  return globalForDb.__infraschouwDb;
}

/** Lazily-initialised database handle (no connection at import time). */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export async function closeDb() {
  await globalForDb.__infraschouwPool?.end();
  globalForDb.__infraschouwPool = undefined;
  globalForDb.__infraschouwDb = undefined;
}

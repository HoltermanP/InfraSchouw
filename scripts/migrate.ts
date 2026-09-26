import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db/client";

async function main() {
  const started = Date.now();
  await migrate(getDb(), { migrationsFolder: "./src/db/migrations" });
  console.log(`Migraties uitgevoerd in ${Date.now() - started} ms`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

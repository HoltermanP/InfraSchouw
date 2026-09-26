import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { closeDb } from "../src/db/client";
import { seedBase } from "./seed/base";
import { seedDemo } from "./seed/demo";

async function main() {
  const started = Date.now();
  const base = await seedBase();
  console.log(`Organisatie "${base.org.name}" met ${Object.keys(base.users).length} gebruikers en standaardtemplates.`);
  const demo = await seedDemo(base);
  console.log(demo.summary);
  console.log(`Seed klaar in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

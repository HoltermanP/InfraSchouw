/**
 * Adds the showcase project with five complete inspections to an existing
 * organisation (additive; only a previous showcase run is replaced):
 *   pnpm seed:showcase --org <organisation-id> --user <user-email>
 * Run `pnpm build` / deploy first so the photos in public/demo are served.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { and, eq } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { memberships, organizations, users } from "../src/db/schema";
import { seedShowcase } from "./seed/showcase";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const orgId = arg("org");
  const email = arg("user");
  if (!orgId || !email) throw new Error("Gebruik: pnpm seed:showcase --org <organisatie-id> --user <e-mail>");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw new Error(`Organisatie ${orgId} niet gevonden.`);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`Gebruiker ${email} niet gevonden.`);
  const [member] = await db.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id))).limit(1);
  if (!member) throw new Error(`${email} is geen lid van "${org.name}".`);
  console.log(`Database: ${new URL(process.env.DATABASE_URL!).host}\nOrganisatie: ${org.name} (${org.id})\nGebruiker: ${user.name} <${user.email}>`);
  const started = Date.now();
  const summary = await seedShowcase(org.id, user.id);
  console.log(summary.join("\n"));
  console.log(`Klaar in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

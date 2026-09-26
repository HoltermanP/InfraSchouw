import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { memberships, organizations, users } from "../../src/db/schema";
import { ensureStandardTemplates } from "../../src/db/queries/templates";
import type { Role } from "../../src/lib/domain";

export const DEMO_ORG_NAME = "Demo Infra BV";

export const DEMO_USERS: { role: Role; name: string; email: string }[] = [
  { role: "admin", name: "Anne de Vries", email: "admin@demo-infra.nl" },
  { role: "projectleider", name: "Pieter Jansen", email: "projectleider@demo-infra.nl" },
  { role: "schouwer", name: "Sanne Bakker", email: "schouwer@demo-infra.nl" },
  { role: "lezer", name: "Lars Visser", email: "lezer@demo-infra.nl" },
];

/** Idempotently create the demo organisation, its users and templates. */
export async function seedBase() {
  let [org] = await db.select().from(organizations).where(eq(organizations.name, DEMO_ORG_NAME)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        name: DEMO_ORG_NAME,
        slug: "demo-infra",
        settings: {
          branding: {
            logoUrl: null,
            primaryColor: "#0f4c81",
            accentColor: "#f59e0b",
            footerText: "Demo Infra BV · Ingenieursbureau kabels & leidingen · www.demo-infra.nl",
            companyName: "Demo Infra BV",
          },
        },
      })
      .returning();
  }
  const byRole = {} as Record<Role, { id: string; name: string }>;
  for (const u of DEMO_USERS) {
    let [user] = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (!user) [user] = await db.insert(users).values({ email: u.email, name: u.name }).returning();
    await db
      .insert(memberships)
      .values({ orgId: org!.id, userId: user!.id, role: u.role })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: u.role } });
    byRole[u.role] = { id: user!.id, name: user!.name };
  }
  await ensureStandardTemplates(org!.id, db, byRole.admin.id);
  return { org: org!, users: byRole };
}

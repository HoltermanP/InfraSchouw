import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, users } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import type { Role } from "@/lib/domain";

export const hasDb = Boolean(process.env.DATABASE_URL);

/** Create an isolated test organisation with one user per requested role. */
export async function createTestOrg(label: string, roles: Role[] = ["admin"]) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [org] = await db.insert(organizations).values({ name: `Test ${label} ${suffix}` }).returning();
  const ctxs: Record<string, OrgCtx> = {};
  for (const role of roles) {
    const [user] = await db
      .insert(users)
      .values({ email: `${role}-${suffix}@test.local`, name: `${label} ${role}` })
      .returning();
    await db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role });
    ctxs[role] = { orgId: org!.id, userId: user!.id, role };
  }
  return { org: org!, ctx: ctxs as Record<Role, OrgCtx> };
}

export async function dropTestOrgs(orgIds: string[]) {
  if (orgIds.length === 0) return;
  const members = await db.select({ userId: memberships.userId }).from(memberships).where(inArray(memberships.orgId, orgIds));
  await db.delete(organizations).where(inArray(organizations.id, orgIds));
  if (members.length) await db.delete(users).where(inArray(users.id, members.map((m) => m.userId)));
}

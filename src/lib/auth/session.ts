import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, users } from "@/db/schema";
import { ForbiddenError, type OrgCtx } from "@/db/scope";
import { env } from "@/lib/env";
import { roleAtLeast, type Role } from "@/lib/domain";
import { resolveOrgSettings, type ResolvedOrgSettings } from "@/lib/org-settings";

export const DEMO_USER_COOKIE = "infraschouw_demo_user";
export const DEMO_ORG_COOKIE = "infraschouw_demo_org";

export type AuthMode = "clerk" | "demo" | "unconfigured";

export function authMode(): AuthMode {
  if (env.clerk.enabled) return "clerk";
  if (env.demoMode) return "demo";
  return "unconfigured";
}

export type SessionUser = { id: string; name: string; email: string; imageUrl: string | null };
export type SessionOrg = { id: string; name: string; clerkOrgId: string | null; settings: ResolvedOrgSettings };

export type AppSession =
  | { status: "signed-out"; mode: AuthMode }
  | { status: "no-org"; mode: AuthMode; user: SessionUser }
  | {
      status: "ok";
      mode: AuthMode;
      user: SessionUser;
      org: SessionOrg;
      role: Role;
      ctx: OrgCtx;
    };
export type ActiveSession = Extract<AppSession, { status: "ok" }>;

/** Map Clerk organisation roles onto app roles for first-time members. */
export function mapClerkRole(orgRole: string | null | undefined): Role {
  switch (orgRole) {
    case "org:admin":
      return "admin";
    case "org:projectleider":
      return "projectleider";
    case "org:lezer":
    case "org:viewer":
      return "lezer";
    default:
      return "schouwer";
  }
}

async function loadMembership(userId: string, orgId: string) {
  const rows = await db
    .select({ role: memberships.role, org: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

function toSessionOrg(org: typeof organizations.$inferSelect): SessionOrg {
  return { id: org.id, name: org.name, clerkOrgId: org.clerkOrgId, settings: resolveOrgSettings(org.settings) };
}

async function clerkSession(): Promise<AppSession> {
  const { auth, currentUser, clerkClient } = await import("@clerk/nextjs/server");
  const { userId: clerkUserId, orgId: clerkOrgId, orgRole } = await auth();
  if (!clerkUserId) return { status: "signed-out", mode: "clerk" };

  let [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!user) {
    const cu = await currentUser();
    const email = cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@onbekend`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || email;
    [user] = await db
      .insert(users)
      .values({ clerkUserId, email, name, imageUrl: cu?.imageUrl ?? null })
      .onConflictDoUpdate({ target: users.clerkUserId, set: { email, name } })
      .returning();
  }
  const sessionUser: SessionUser = { id: user!.id, name: user!.name, email: user!.email, imageUrl: user!.imageUrl };
  if (!clerkOrgId) return { status: "no-org", mode: "clerk", user: sessionUser };

  let [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (!org) {
    const client = await clerkClient();
    const co = await client.organizations.getOrganization({ organizationId: clerkOrgId });
    [org] = await db
      .insert(organizations)
      .values({ clerkOrgId, name: co.name, slug: co.slug })
      .onConflictDoUpdate({ target: organizations.clerkOrgId, set: { name: co.name } })
      .returning();
    // First org sync: seed the standard templates for this organisation.
    const { ensureStandardTemplates } = await import("@/db/queries/templates");
    await ensureStandardTemplates(org!.id);
  }
  let membership = await loadMembership(user!.id, org!.id);
  if (!membership) {
    await db
      .insert(memberships)
      .values({ orgId: org!.id, userId: user!.id, role: mapClerkRole(orgRole) })
      .onConflictDoNothing();
    membership = await loadMembership(user!.id, org!.id);
  }
  const role = membership!.role;
  return {
    status: "ok",
    mode: "clerk",
    user: sessionUser,
    org: toSessionOrg(org!),
    role,
    ctx: { orgId: org!.id, userId: user!.id, role },
  };
}

async function demoSession(): Promise<AppSession> {
  const jar = await cookies();
  const userId = jar.get(DEMO_USER_COOKIE)?.value;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return { status: "signed-out", mode: "demo" };
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { status: "signed-out", mode: "demo" };
  const sessionUser: SessionUser = { id: user.id, name: user.name, email: user.email, imageUrl: user.imageUrl };
  const preferredOrg = jar.get(DEMO_ORG_COOKIE)?.value;
  let membership = preferredOrg && /^[0-9a-f-]{36}$/i.test(preferredOrg) ? await loadMembership(user.id, preferredOrg) : null;
  if (!membership) {
    const rows = await db
      .select({ role: memberships.role, org: organizations })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    membership = rows[0] ?? null;
  }
  if (!membership) return { status: "no-org", mode: "demo", user: sessionUser };
  return {
    status: "ok",
    mode: "demo",
    user: sessionUser,
    org: toSessionOrg(membership.org),
    role: membership.role,
    ctx: { orgId: membership.org.id, userId: user.id, role: membership.role },
  };
}

/** Current session, memoised per request. */
export const getSession = cache(async (): Promise<AppSession> => {
  const mode = authMode();
  if (mode === "clerk") return clerkSession();
  if (mode === "demo") return demoSession();
  return { status: "signed-out", mode };
});

export function signInPath(): string {
  const mode = authMode();
  if (mode === "clerk") return "/sign-in";
  if (mode === "demo") return "/demo-login";
  return "/configuratie";
}

/** For pages/server actions: redirects when not signed in / no org. */
export async function requireSession(minRole?: Role): Promise<ActiveSession> {
  const session = await getSession();
  if (session.status === "signed-out") redirect(signInPath());
  if (session.status === "no-org") redirect("/organisatie");
  if (minRole && !roleAtLeast(session.role, minRole)) forbidden();
  return session;
}

/** For server actions that must fail instead of redirecting. */
export async function requireCtx(minRole?: Role): Promise<OrgCtx> {
  const session = await getSession();
  if (session.status !== "ok") throw new ForbiddenError("Je bent niet ingelogd.");
  if (minRole && !roleAtLeast(session.role, minRole)) throw new ForbiddenError();
  return session.ctx;
}

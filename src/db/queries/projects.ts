import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../client";
import { inspections, memberships, projectMembers, projects, users } from "../schema";
import { orgWhere, type OrgCtx } from "../scope";
import type { ProjectPhase, ProjectStatus } from "@/lib/domain";

export type ProjectListFilters = { q?: string; status?: ProjectStatus; phase?: ProjectPhase };

export async function listProjects(ctx: OrgCtx, filters: ProjectListFilters = {}) {
  const q = filters.q?.trim();
  return db
    .select({
      project: projects,
      inspectionCount: sql<number>`(select count(*)::int from ${inspections} i where i.project_id = ${projects.id})`,
      lastInspectionAt: sql<Date | null>`(select max(i.started_at) from ${inspections} i where i.project_id = ${projects.id})`,
    })
    .from(projects)
    .where(
      orgWhere(
        projects,
        ctx,
        q ? or(ilike(projects.name, `%${q}%`), ilike(projects.number, `%${q}%`), ilike(projects.client, `%${q}%`)) : undefined,
        filters.status ? eq(projects.status, filters.status) : undefined,
        filters.phase ? eq(projects.phase, filters.phase) : undefined,
      ),
    )
    .orderBy(desc(projects.updatedAt));
}

export async function listProjectOptions(ctx: OrgCtx) {
  return db
    .select({ id: projects.id, number: projects.number, name: projects.name })
    .from(projects)
    .where(orgWhere(projects, ctx, sql`${projects.status} <> 'gearchiveerd'`))
    .orderBy(asc(projects.number));
}

export async function getProject(ctx: OrgCtx, id: string) {
  const [row] = await db.select().from(projects).where(orgWhere(projects, ctx, eq(projects.id, id))).limit(1);
  return row ?? null;
}

export async function listProjectMembers(ctx: OrgCtx, projectId: string) {
  return db
    .select({ member: projectMembers, user: users, orgRole: memberships.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.orgId, ctx.orgId)))
    .where(orgWhere(projectMembers, ctx, eq(projectMembers.projectId, projectId)))
    .orderBy(asc(users.name));
}

export async function listOrgMembers(ctx: OrgCtx) {
  return db
    .select({ user: users, role: memberships.role, membershipId: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.orgId))
    .orderBy(asc(users.name));
}

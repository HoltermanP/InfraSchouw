"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { projectMembers, projects } from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit, diffFields } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { parseAreaGeoJson, projectInputSchema, type ProjectInput } from "@/lib/validation/project";

export async function createProject(input: ProjectInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const data = projectInputSchema.parse(input);
    const area = parseAreaGeoJson(data.areaGeojson);
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(orgWhere(projects, ctx, eq(projects.number, data.number)))
      .limit(1);
    if (existing.length) throw new UserError(`Projectnummer ${data.number} bestaat al.`);
    const [project] = await scoped(ctx).insert(projects, { ...data, areaGeojson: area });
    if (ctx.userId) {
      await scoped(ctx).insert(projectMembers, { projectId: project!.id, userId: ctx.userId, projectRole: "projectleider" });
    }
    await audit(ctx, "create", "project", project!.id, `Project ${data.number} aangemaakt`);
    revalidatePath("/projecten");
    return { id: project!.id };
  }, "Project aangemaakt");
}

export async function updateProject(id: string, input: ProjectInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const data = projectInputSchema.parse(input);
    const before = await scoped(ctx).getById(projects, id);
    const area = data.areaGeojson === undefined ? before.areaGeojson : parseAreaGeoJson(data.areaGeojson);
    const after = await scoped(ctx).update(projects, id, { ...data, areaGeojson: area });
    await audit(ctx, "update", "project", id, `Project ${after.number} gewijzigd`, diffFields(before, after));
    revalidatePath(`/projecten/${id}`, "layout");
    return { id };
  }, "Project opgeslagen");
}

export async function setProjectArea(id: string, area: unknown) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const parsed = parseAreaGeoJson(area);
    await scoped(ctx).update(projects, id, { areaGeojson: parsed });
    await audit(ctx, "update", "project", id, parsed ? "Projectgebied gewijzigd" : "Projectgebied verwijderd");
    revalidatePath(`/projecten/${id}`, "layout");
    return null;
  }, "Projectgebied opgeslagen");
}

export async function deleteProject(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const p = await scoped(ctx).getById(projects, id);
    await scoped(ctx).remove(projects, id);
    await audit(ctx, "delete", "project", id, `Project ${p.number} verwijderd`);
    revalidatePath("/projecten");
    return null;
  }, "Project verwijderd");
}

const memberSchema = z.object({ projectId: z.string().uuid(), userId: z.string().uuid(), projectRole: z.string().trim().min(1).max(60) });

export async function addProjectMember(input: z.input<typeof memberSchema>) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const data = memberSchema.parse(input);
    await scoped(ctx).getById(projects, data.projectId);
    await db
      .insert(projectMembers)
      .values({ ...data, orgId: ctx.orgId, createdBy: ctx.userId })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { projectRole: data.projectRole } });
    revalidatePath(`/projecten/${data.projectId}/team`);
    return null;
  }, "Teamlid toegevoegd");
}

export async function removeProjectMember(projectId: string, userId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    await scoped(ctx).removeWhere(projectMembers, and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    revalidatePath(`/projecten/${projectId}/team`);
    return null;
  }, "Teamlid verwijderd");
}

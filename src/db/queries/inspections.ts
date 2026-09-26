import { and, desc, eq, gte, ilike, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../client";
import { captures, findings, inspections, inspectionTemplates, projects, reports, stations, users } from "../schema";
import { orgWhere, type OrgCtx } from "../scope";
import type { InspectionStatus } from "@/lib/domain";

export type InspectionFilters = {
  q?: string;
  templateId?: string;
  status?: InspectionStatus;
  projectId?: string;
  inspectorId?: string;
  from?: string;
  to?: string;
  linked?: "los" | "gekoppeld";
  stationId?: string;
  limit?: number;
};

export async function listInspections(ctx: OrgCtx, f: InspectionFilters = {}) {
  return db
    .select({
      inspection: inspections,
      templateName: inspectionTemplates.name,
      projectNumber: projects.number,
      projectName: projects.name,
      stationCode: stations.code,
      inspectorName: users.name,
      reportStatus: reports.status,
      reportId: reports.id,
      captureCount: sql<number>`(select count(*)::int from ${captures} c where c.inspection_id = ${inspections.id})`,
      openFindings: sql<number>`(select count(*)::int from ${findings} f where f.inspection_id = ${inspections.id} and f.status = 'open')`,
    })
    .from(inspections)
    .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
    .leftJoin(projects, eq(projects.id, inspections.projectId))
    .leftJoin(stations, eq(stations.id, inspections.stationId))
    .leftJoin(users, eq(users.id, inspections.inspectorId))
    .leftJoin(reports, eq(reports.inspectionId, inspections.id))
    .where(
      orgWhere(
        inspections,
        ctx,
        f.q ? ilike(inspections.title, `%${f.q}%`) : undefined,
        f.templateId ? eq(inspections.templateId, f.templateId) : undefined,
        f.status ? eq(inspections.status, f.status) : undefined,
        f.projectId ? eq(inspections.projectId, f.projectId) : undefined,
        f.stationId ? eq(inspections.stationId, f.stationId) : undefined,
        f.inspectorId ? eq(inspections.inspectorId, f.inspectorId) : undefined,
        f.from ? gte(inspections.startedAt, new Date(f.from)) : undefined,
        f.to ? lte(inspections.startedAt, new Date(`${f.to}T23:59:59`)) : undefined,
        f.linked === "los" ? isNull(inspections.projectId) : f.linked === "gekoppeld" ? isNotNull(inspections.projectId) : undefined,
      ),
    )
    .orderBy(desc(inspections.startedAt))
    .limit(f.limit ?? 200);
}

export async function getInspectionHeader(ctx: OrgCtx, id: string) {
  const [row] = await db
    .select({
      inspection: inspections,
      template: inspectionTemplates,
      project: projects,
      station: stations,
      inspector: users,
      report: reports,
    })
    .from(inspections)
    .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
    .leftJoin(projects, eq(projects.id, inspections.projectId))
    .leftJoin(stations, eq(stations.id, inspections.stationId))
    .leftJoin(users, eq(users.id, inspections.inspectorId))
    .leftJoin(reports, eq(reports.inspectionId, inspections.id))
    .where(and(eq(inspections.orgId, ctx.orgId), eq(inspections.id, id)))
    .limit(1);
  return row ?? null;
}

import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions,
  asbuiltChecks,
  billingEvidence,
  billingItems,
  captureAnalyses,
  captures,
  checklistAnswers,
  findingCaptures,
  findings,
  gpsTracks,
  inspectionParticipants,
  inspections,
  measurements,
  organizations,
  projects,
  reports,
  reportVersions,
  stationDescriptions,
  stationExpectedConfigs,
  stations,
  transcriptSegments,
  transcripts,
  users,
} from "@/db/schema";
import { getTemplateFull, type TemplateFull } from "@/db/queries/templates";
import type { CaptureAnalysis } from "@/lib/ai/schemas";
import { resolveOrgSettings } from "@/lib/org-settings";

export type ContextCapture = typeof captures.$inferSelect & { analysis: CaptureAnalysis | null; analysisModel: string | null };
export type ContextFinding = typeof findings.$inferSelect & { captureIds: string[] };

/**
 * Everything known about one inspection: the single source for AI synthesis,
 * the no-AI baseline report, the editor, all exports and the share view.
 */
export async function loadInspectionContext(orgId: string, inspectionId: string) {
  const [inspection] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.orgId, orgId), eq(inspections.id, inspectionId)))
    .limit(1);
  if (!inspection) return null;
  const orgCtx = { orgId, userId: null, role: "admin" as const };

  const [
    [org],
    template,
    [project],
    [station],
    captureRows,
    analyses,
    transcriptRows,
    segmentRows,
    measurementRows,
    findingRows,
    findingCaptureRows,
    actionRows,
    answerRows,
    participantRows,
    [track],
    [inspector],
    [report],
  ] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1),
    getTemplateFull(orgCtx, inspection.templateId),
    inspection.projectId ? db.select().from(projects).where(eq(projects.id, inspection.projectId)).limit(1) : Promise.resolve([]),
    inspection.stationId ? db.select().from(stations).where(eq(stations.id, inspection.stationId)).limit(1) : Promise.resolve([]),
    db
      .select()
      .from(captures)
      .where(and(eq(captures.orgId, orgId), eq(captures.inspectionId, inspectionId)))
      .orderBy(asc(captures.capturedAt)),
    db
      .selectDistinctOn([captureAnalyses.captureId], { captureId: captureAnalyses.captureId, result: captureAnalyses.result, model: captureAnalyses.model })
      .from(captureAnalyses)
      .innerJoin(captures, eq(captures.id, captureAnalyses.captureId))
      .where(and(eq(captureAnalyses.orgId, orgId), eq(captures.inspectionId, inspectionId)))
      .orderBy(captureAnalyses.captureId, desc(captureAnalyses.version)),
    db.select().from(transcripts).where(and(eq(transcripts.orgId, orgId), eq(transcripts.inspectionId, inspectionId))),
    db
      .select()
      .from(transcriptSegments)
      .where(and(eq(transcriptSegments.orgId, orgId), eq(transcriptSegments.inspectionId, inspectionId)))
      .orderBy(asc(transcriptSegments.startAt)),
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.orgId, orgId), eq(measurements.inspectionId, inspectionId)))
      .orderBy(asc(measurements.measuredAt)),
    db
      .select()
      .from(findings)
      .where(and(eq(findings.orgId, orgId), eq(findings.inspectionId, inspectionId)))
      .orderBy(asc(findings.seq), asc(findings.createdAt)),
    db
      .select({ findingId: findingCaptures.findingId, captureId: findingCaptures.captureId })
      .from(findingCaptures)
      .innerJoin(findings, eq(findings.id, findingCaptures.findingId))
      .where(and(eq(findingCaptures.orgId, orgId), eq(findings.inspectionId, inspectionId))),
    db
      .select()
      .from(actions)
      .where(and(eq(actions.orgId, orgId), eq(actions.inspectionId, inspectionId)))
      .orderBy(asc(actions.createdAt)),
    db.select().from(checklistAnswers).where(and(eq(checklistAnswers.orgId, orgId), eq(checklistAnswers.inspectionId, inspectionId))),
    db
      .select()
      .from(inspectionParticipants)
      .where(and(eq(inspectionParticipants.orgId, orgId), eq(inspectionParticipants.inspectionId, inspectionId)))
      .orderBy(asc(inspectionParticipants.createdAt)),
    db.select().from(gpsTracks).where(and(eq(gpsTracks.orgId, orgId), eq(gpsTracks.inspectionId, inspectionId))).limit(1),
    inspection.inspectorId ? db.select().from(users).where(eq(users.id, inspection.inspectorId)).limit(1) : Promise.resolve([]),
    db.select().from(reports).where(and(eq(reports.orgId, orgId), eq(reports.inspectionId, inspectionId))).limit(1),
  ]);

  const analysisMap = new Map(analyses.map((a) => [a.captureId, a]));
  const captureList: ContextCapture[] = captureRows.map((c) => ({
    ...c,
    analysis: analysisMap.get(c.id)?.result ?? null,
    analysisModel: analysisMap.get(c.id)?.model ?? null,
  }));
  const findingCaptureMap = new Map<string, string[]>();
  for (const fc of findingCaptureRows) findingCaptureMap.set(fc.findingId, [...(findingCaptureMap.get(fc.findingId) ?? []), fc.captureId]);
  const findingList: ContextFinding[] = findingRows.map((f) => ({ ...f, captureIds: findingCaptureMap.get(f.id) ?? [] }));

  const [stationDesc, expected, asbuilt] = inspection.stationId
    ? await Promise.all([
        db.select().from(stationDescriptions).where(and(eq(stationDescriptions.orgId, orgId), eq(stationDescriptions.inspectionId, inspectionId))).limit(1),
        db.select().from(stationExpectedConfigs).where(and(eq(stationExpectedConfigs.orgId, orgId), eq(stationExpectedConfigs.stationId, inspection.stationId))).limit(1),
        db.select().from(asbuiltChecks).where(and(eq(asbuiltChecks.orgId, orgId), eq(asbuiltChecks.inspectionId, inspectionId))).limit(1),
      ])
    : [[], [], []];

  const [billing, evidence] = inspection.projectId
    ? await Promise.all([
        db.select().from(billingItems).where(and(eq(billingItems.orgId, orgId), eq(billingItems.projectId, inspection.projectId))).orderBy(asc(billingItems.sort), asc(billingItems.code)),
        db.select().from(billingEvidence).where(and(eq(billingEvidence.orgId, orgId), eq(billingEvidence.inspectionId, inspectionId))),
      ])
    : [[], []];

  let currentVersion: typeof reportVersions.$inferSelect | null = null;
  if (report?.currentVersionId) {
    const [v] = await db.select().from(reportVersions).where(eq(reportVersions.id, report.currentVersionId)).limit(1);
    currentVersion = v ?? null;
  }

  return {
    org: { ...org!, settings: resolveOrgSettings(org!.settings) },
    inspection,
    inspector: inspector ?? null,
    template: template as TemplateFull,
    project: project ?? null,
    station: station ?? null,
    stationDescription: stationDesc[0] ?? null,
    expectedConfig: expected[0] ?? null,
    asbuilt: asbuilt[0] ?? null,
    captures: captureList,
    transcripts: transcriptRows,
    segments: segmentRows,
    measurements: measurementRows,
    findings: findingList,
    actions: actionRows,
    answers: answerRows,
    participants: participantRows,
    track: track ?? null,
    billingItems: billing,
    billingEvidence: evidence,
    report: report ?? null,
    currentVersion,
  };
}

export type InspectionContext = NonNullable<Awaited<ReturnType<typeof loadInspectionContext>>>;

/** Photos (incl. video/sketch) that may appear in the report, numbered. */
export function reportPhotos(ctx: InspectionContext) {
  return ctx.captures.filter((c) => (c.type === "photo" || c.type === "video" || c.type === "sketch") && !c.hiddenInReport);
}

export function captureLabel(c: Pick<ContextCapture, "seq" | "id">) {
  return c.seq ? `Foto ${c.seq}` : `Foto ${c.id.slice(0, 6)}`;
}

/** Count helper used by dashboards. */
export async function countByInspection(orgId: string, inspectionIds: string[]) {
  if (inspectionIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ id: captures.inspectionId, n: sql<number>`count(*)::int` })
    .from(captures)
    .where(and(eq(captures.orgId, orgId), inArray(captures.inspectionId, inspectionIds)))
    .groupBy(captures.inspectionId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

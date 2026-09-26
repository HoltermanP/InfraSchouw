import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { captureAnnotations, captures, inspectionParticipants, inspections, organizations, reportExports, reports } from "@/db/schema";
import { resolveOrgSettings } from "@/lib/org-settings";
import { deleteObject } from "@/lib/storage";

/** Delete an inspection with every stored file (AVG deletion request / retention). */
export async function deleteInspectionData(orgId: string, inspectionId: string): Promise<number> {
  const caps = await db.select().from(captures).where(and(eq(captures.orgId, orgId), eq(captures.inspectionId, inspectionId)));
  const anns = caps.length ? await db.select().from(captureAnnotations).where(and(eq(captureAnnotations.orgId, orgId), inArray(captureAnnotations.captureId, caps.map((c) => c.id)))) : [];
  const parts = await db.select().from(inspectionParticipants).where(and(eq(inspectionParticipants.orgId, orgId), eq(inspectionParticipants.inspectionId, inspectionId)));
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, orgId), eq(reports.inspectionId, inspectionId)));
  const exps = report ? await db.select().from(reportExports).where(eq(reportExports.reportId, report.id)) : [];
  const urls = [
    ...caps.flatMap((c) => [c.blobUrl, c.thumbUrl, ...(c.meta.keyframes ?? []).map((k) => k.url)]),
    ...anns.map((a) => a.renderedUrl),
    ...parts.map((p) => p.signatureUrl),
    ...exps.map((e) => e.blobUrl),
    report?.mapSnapshotUrl,
  ].filter((u): u is string => Boolean(u));
  await db.delete(inspections).where(and(eq(inspections.orgId, orgId), eq(inspections.id, inspectionId)));
  const unique = [...new Set(urls)];
  await Promise.all(unique.map((u) => deleteObject(u).catch(() => undefined)));
  return unique.length;
}

/** Apply the organisation's retention period (months) to inspections. */
export async function purgeExpiredInspections(orgId?: string) {
  const orgs = orgId ? await db.select().from(organizations).where(eq(organizations.id, orgId)) : await db.select().from(organizations);
  let inspectionsDeleted = 0;
  let files = 0;
  for (const org of orgs) {
    const months = resolveOrgSettings(org.settings).privacy.retentionMonths;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const expired = await db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.orgId, org.id), lt(inspections.startedAt, cutoff)));
    for (const i of expired) {
      files += await deleteInspectionData(org.id, i.id);
      inspectionsDeleted++;
    }
  }
  return { inspections: inspectionsDeleted, files };
}

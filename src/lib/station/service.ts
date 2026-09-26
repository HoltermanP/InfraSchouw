import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { asbuiltChecks, findings, inspections, stationDescriptions, stationExpectedConfigs } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { compareAsbuilt, type AsbuiltRow } from "./asbuilt";
import { emptyStationDescription } from "./schema";
import type { StationDescriptionDoc } from "./types";

export async function getStationDescription(orgId: string, inspectionId: string) {
  const [row] = await db
    .select()
    .from(stationDescriptions)
    .where(and(eq(stationDescriptions.orgId, orgId), eq(stationDescriptions.inspectionId, inspectionId)))
    .limit(1);
  return row ?? null;
}

export async function saveStationDescription(ctx: OrgCtx, inspectionId: string, stationId: string, data: StationDescriptionDoc) {
  await db
    .insert(stationDescriptions)
    .values({ orgId: ctx.orgId, inspectionId, stationId, data, createdBy: ctx.userId })
    .onConflictDoUpdate({ target: stationDescriptions.inspectionId, set: { data, stationId, updatedAt: new Date() }, setWhere: eq(stationDescriptions.orgId, ctx.orgId) });
}

/**
 * Compare expected vs. found configuration; store the rows and turn each
 * deviation into a finding (category contract/techniek). Previous automatic
 * as-built findings that were not yet handled are replaced.
 */
export async function runAsbuiltCheck(ctx: OrgCtx, inspectionId: string): Promise<AsbuiltRow[] | null> {
  const [insp] = await db.select().from(inspections).where(and(eq(inspections.orgId, ctx.orgId), eq(inspections.id, inspectionId))).limit(1);
  if (!insp?.stationId) return null;
  const [expected] = await db
    .select()
    .from(stationExpectedConfigs)
    .where(and(eq(stationExpectedConfigs.orgId, ctx.orgId), eq(stationExpectedConfigs.stationId, insp.stationId)))
    .limit(1);
  if (!expected) return null;
  const desc = await getStationDescription(ctx.orgId, inspectionId);
  const rows = compareAsbuilt(expected.config, desc?.data.values ?? emptyStationDescription());
  await db
    .insert(asbuiltChecks)
    .values({ orgId: ctx.orgId, inspectionId, stationId: insp.stationId, rows, createdBy: ctx.userId })
    .onConflictDoUpdate({ target: asbuiltChecks.inspectionId, set: { rows, updatedAt: new Date() }, setWhere: eq(asbuiltChecks.orgId, ctx.orgId) });

  await db
    .delete(findings)
    .where(and(eq(findings.orgId, ctx.orgId), eq(findings.inspectionId, inspectionId), eq(findings.source, "asbuilt"), eq(findings.status, "open")));
  const deviations = rows.filter((r) => r.status === "afwijkend");
  if (deviations.length) {
    const { findingCaptures } = await import("@/db/schema");
    for (const r of deviations) {
      const [f] = await db
        .insert(findings)
        .values({
          orgId: ctx.orgId,
          inspectionId,
          projectId: insp.projectId,
          title: `As-built afwijking: ${r.label}`,
          description: `Verwacht volgens ontwerp: ${r.expected ?? "—"}. Aangetroffen: ${r.found ?? "—"}.`,
          category: r.category,
          priority: r.category === "contract" ? "hoog" : "midden",
          recommendation: "Afwijking laten verklaren door de aannemer en ontwerp of revisie bijwerken; afrekening hierop afstemmen.",
          lat: insp.lat,
          lon: insp.lon,
          source: "asbuilt",
          aiAccepted: true,
          createdBy: ctx.userId,
        })
        .returning();
      if (r.captureIds.length) {
        await db.insert(findingCaptures).values(r.captureIds.map((captureId) => ({ orgId: ctx.orgId, findingId: f!.id, captureId }))).onConflictDoNothing();
      }
    }
  }
  await audit(ctx, "asbuilt_check", "station_description", inspectionId, `As-built-check: ${deviations.length} afwijking(en)`);
  return rows;
}

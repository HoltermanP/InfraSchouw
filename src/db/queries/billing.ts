import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { billingEvidence, billingItems, captures, inspections } from "../schema";
import type { OrgCtx } from "../scope";
import { billingOverview } from "@/lib/billing/import";
import { captureUrl } from "@/lib/media-url";

/** Billing items, overview (planned vs demonstrated) and all evidence of a project. */
export async function projectBilling(ctx: OrgCtx, projectId: string) {
  const items = await db
    .select()
    .from(billingItems)
    .where(and(eq(billingItems.orgId, ctx.orgId), eq(billingItems.projectId, projectId)))
    .orderBy(asc(billingItems.sort), asc(billingItems.code));
  const evidence = await db
    .select({ e: billingEvidence, item: billingItems, inspection: { id: inspections.id, title: inspections.title, startedAt: inspections.startedAt } })
    .from(billingEvidence)
    .innerJoin(billingItems, eq(billingItems.id, billingEvidence.billingItemId))
    .innerJoin(inspections, eq(inspections.id, billingEvidence.inspectionId))
    .where(and(eq(billingEvidence.orgId, ctx.orgId), eq(billingItems.projectId, projectId)))
    .orderBy(asc(billingItems.sort), desc(inspections.startedAt));
  const captureIds = [...new Set(evidence.flatMap((r) => r.e.captureIds))];
  const seqRows = captureIds.length ? await db.select({ id: captures.id, seq: captures.seq, blobUrl: captures.blobUrl, lat: captures.lat, lon: captures.lon, capturedAt: captures.capturedAt, rdX: captures.rdX, rdY: captures.rdY }).from(captures).where(and(eq(captures.orgId, ctx.orgId), inArray(captures.id, captureIds))) : [];
  const capMap = new Map(seqRows.map((r) => [r.id, r]));
  const overview = billingOverview(items, evidence.map((r) => ({ billingItemId: r.e.billingItemId, quantity: r.e.quantity, status: r.e.status })));
  return {
    items,
    overview,
    evidence: evidence.map((r) => ({
      ...r,
      photos: r.e.captureIds.map((id) => ({ id, seq: capMap.get(id)?.seq ?? null, thumb: captureUrl(id, "thumb"), capture: capMap.get(id) ?? null })),
    })),
  };
}

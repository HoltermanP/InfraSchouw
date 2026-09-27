import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { db, type Tx } from "@/db/client";
import {
  captures,
  checklistAnswers,
  findingCaptures,
  findings,
  gpsPoints,
  gpsTracks,
  inspectionParticipants,
  inspections,
  inspectionTemplates,
  measurements,
  projects,
  stations,
  templateChecklistItems,
} from "@/db/schema";
import { ForbiddenError, NotFoundError, orgWhere, scoped, type OrgCtx } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { lineLengthMeters } from "@/lib/geo/rd";
import { trackToLineString } from "@/lib/geo/track-matching";
import { relocateFromTrack, rdFor, tracksRoute, upsertCapture } from "@/lib/capture-sources/persist";
import { deleteObject, belongsToOrg } from "@/lib/storage";
import { enqueueCaptureProcessing, enqueueInspectionProcessing } from "@/lib/ai/enqueue";
import { linkSegmentsToCaptures } from "@/lib/ai/link-segments";
import type { SyncOp, SyncOpResult } from "./ops";

type SideEffect = () => Promise<unknown>;

class PermanentError extends Error {}

function assertStoredUrl(ctx: OrgCtx, url: string | null | undefined) {
  if (url && !belongsToOrg(url, ctx.orgId)) throw new PermanentError("Bestandsverwijzing hoort niet bij deze organisatie.");
}

async function ensureInspection(ctx: OrgCtx, id: string, tx: Tx) {
  const row = await scoped(ctx, tx).findById(inspections, id);
  if (!row) throw new NotFoundError("Schouw niet gevonden.");
  return row;
}

async function applyOne(ctx: OrgCtx, op: SyncOp, tx: Tx, effects: SideEffect[]) {
  const s = scoped(ctx, tx);
  switch (op.kind) {
    case "inspection.upsert": {
      const p = op.payload;
      await s.getById(inspectionTemplates, p.templateId, "Schouwtype niet gevonden.");
      if (p.projectId) await s.getById(projects, p.projectId, "Project niet gevonden.");
      let stationId = p.stationId;
      if (p.newStation) {
        const ns = p.newStation;
        const [existingStation] = await tx.select().from(stations).where(eq(stations.id, ns.id)).limit(1);
        if (existingStation && existingStation.orgId !== ctx.orgId) throw new ForbiddenError();
        if (!existingStation) {
          const [byCode] = await tx
            .select({ id: stations.id })
            .from(stations)
            .where(orgWhere(stations, ctx, eq(stations.code, ns.code)))
            .limit(1);
          if (byCode) stationId = byCode.id;
          else {
            await tx.insert(stations).values({
              id: ns.id,
              orgId: ctx.orgId,
              projectId: p.projectId,
              code: ns.code,
              name: ns.name,
              address: ns.address,
              lat: ns.lat,
              lon: ns.lon,
              stationType: (["compact", "inloop", "maas", "klant", "wijk", "schakel"] as const).find((t) => t === ns.stationType) ?? "compact",
              status: "nieuw",
              createdBy: ctx.userId,
            });
            stationId = ns.id;
          }
        } else stationId = existingStation.id;
      }
      if (stationId) await s.getById(stations, stationId, "Station niet gevonden.");
      const [existing] = await tx.select().from(inspections).where(eq(inspections.id, p.id)).limit(1);
      if (existing && existing.orgId !== ctx.orgId) throw new ForbiddenError("Schouw-id is al in gebruik.");
      const values = {
        templateId: p.templateId,
        projectId: p.projectId,
        stationId,
        title: p.title,
        startedAt: new Date(p.startedAt),
        weather: p.weather ?? null,
        address: p.address ?? null,
        // Keep a location fixed later (first located capture) when the client has none.
        lat: p.lat ?? existing?.lat ?? null,
        lon: p.lon ?? existing?.lon ?? null,
        deviceInfo: p.deviceInfo ?? null,
        notes: p.notes ?? null,
      };
      if (existing) {
        await tx.update(inspections).set(values).where(orgWhere(inspections, ctx, eq(inspections.id, p.id)));
      } else {
        await tx.insert(inspections).values({ ...values, id: p.id, orgId: ctx.orgId, inspectorId: ctx.userId, createdBy: ctx.userId, status: "lopend" });
        await tx.insert(gpsTracks).values({ orgId: ctx.orgId, inspectionId: p.id, createdBy: ctx.userId }).onConflictDoNothing();
        effects.push(() => audit(ctx, "create", "inspection", p.id, `Schouw "${p.title}" gestart`));
      }
      return;
    }
    case "inspection.finish": {
      const p = op.payload;
      const insp = await ensureInspection(ctx, p.id, tx);
      if (insp.status !== "lopend") return; // idempotent
      await tx
        .update(inspections)
        .set({ status: "afgerond", endedAt: new Date(p.endedAt), skipped: p.skipped, notes: p.notes ?? insp.notes })
        .where(orgWhere(inspections, ctx, eq(inspections.id, p.id)));
      effects.push(async () => {
        await relocateFromTrack(ctx, p.id);
        await audit(ctx, "finish", "inspection", p.id, `Schouw "${insp.title}" afgerond`);
        await enqueueInspectionProcessing(ctx, p.id);
      });
      return;
    }
    case "participant.upsert": {
      const p = op.payload;
      await ensureInspection(ctx, p.inspectionId, tx);
      assertStoredUrl(ctx, p.signatureUrl);
      const [existing] = await tx.select().from(inspectionParticipants).where(eq(inspectionParticipants.id, p.id)).limit(1);
      if (existing && existing.orgId !== ctx.orgId) throw new ForbiddenError();
      const values = {
        name: p.name,
        organization: p.organization,
        role: p.role,
        signatureUrl: p.signatureUrl ?? existing?.signatureUrl ?? null,
        signedAt: p.signedAt ? new Date(p.signedAt) : (existing?.signedAt ?? null),
      };
      if (existing) await tx.update(inspectionParticipants).set(values).where(eq(inspectionParticipants.id, p.id));
      else await tx.insert(inspectionParticipants).values({ ...values, id: p.id, orgId: ctx.orgId, inspectionId: p.inspectionId, createdBy: ctx.userId });
      return;
    }
    case "capture.upsert": {
      const p = op.payload;
      assertStoredUrl(ctx, p.blobUrl);
      assertStoredUrl(ctx, p.thumbUrl);
      for (const kf of p.meta.keyframes ?? []) assertStoredUrl(ctx, kf.url);
      const { capture, created } = await upsertCapture(ctx, p, tx);
      if (created) effects.push(() => enqueueCaptureProcessing(ctx, capture));
      // Photos often arrive after the speech was transcribed: link them to the spoken text now.
      if (created && capture.inspectionId && capture.type !== "audio") effects.push(() => linkSegmentsToCaptures(ctx.orgId, capture.inspectionId!));
      return;
    }
    case "capture.update": {
      const { id, patch } = op.payload;
      const existing = await s.getById(captures, id, "Capture niet gevonden.");
      const lat = patch.lat !== undefined ? patch.lat : existing.lat;
      const lon = patch.lon !== undefined ? patch.lon : existing.lon;
      await s.update(captures, id, { ...patch, ...(patch.lat !== undefined || patch.lon !== undefined ? rdFor(lat, lon) : {}) });
      return;
    }
    case "capture.delete": {
      const existing = await s.findById(captures, op.payload.id);
      if (!existing) return; // already gone
      await s.remove(captures, op.payload.id);
      effects.push(async () => {
        await deleteObject(existing.blobUrl);
        if (existing.thumbUrl !== existing.blobUrl) await deleteObject(existing.thumbUrl);
      });
      return;
    }
    case "measurement.upsert": {
      const p = op.payload;
      await ensureInspection(ctx, p.inspectionId, tx);
      const ids = [p.captureId, p.photoCaptureId].filter((v): v is string => Boolean(v));
      if (ids.length) await s.assertOwned(captures, ids);
      const [existing] = await tx.select().from(measurements).where(eq(measurements.id, p.id)).limit(1);
      if (existing && existing.orgId !== ctx.orgId) throw new ForbiddenError();
      const values = { ...p, measuredAt: new Date(p.measuredAt) };
      if (existing) await tx.update(measurements).set(values).where(eq(measurements.id, p.id));
      else await tx.insert(measurements).values({ ...values, orgId: ctx.orgId, createdBy: ctx.userId });
      return;
    }
    case "finding.upsert": {
      const p = op.payload;
      const insp = await ensureInspection(ctx, p.inspectionId, tx);
      if (p.captureIds.length) await s.assertOwned(captures, p.captureIds);
      const [existing] = await tx.select().from(findings).where(eq(findings.id, p.id)).limit(1);
      if (existing && existing.orgId !== ctx.orgId) throw new ForbiddenError();
      const values = {
        inspectionId: p.inspectionId,
        projectId: insp.projectId,
        title: p.title,
        description: p.description,
        category: p.category,
        priority: p.priority,
        lat: p.lat,
        lon: p.lon,
        recommendation: p.recommendation ?? existing?.recommendation ?? null,
      };
      if (existing) await tx.update(findings).set(values).where(eq(findings.id, p.id));
      else await tx.insert(findings).values({ ...values, id: p.id, orgId: ctx.orgId, source: "handmatig", createdBy: ctx.userId });
      await tx.delete(findingCaptures).where(and(eq(findingCaptures.orgId, ctx.orgId), eq(findingCaptures.findingId, p.id)));
      if (p.captureIds.length) {
        await tx.insert(findingCaptures).values(p.captureIds.map((captureId) => ({ orgId: ctx.orgId, findingId: p.id, captureId }))).onConflictDoNothing();
      }
      return;
    }
    case "checklist.upsert": {
      const p = op.payload;
      await ensureInspection(ctx, p.inspectionId, tx);
      await s.getById(templateChecklistItems, p.itemId, "Checklistvraag niet gevonden.");
      if (p.captureIds.length) await s.assertOwned(captures, p.captureIds);
      await tx
        .insert(checklistAnswers)
        .values({ ...p, answeredAt: new Date(p.answeredAt), orgId: ctx.orgId, createdBy: ctx.userId })
        .onConflictDoUpdate({
          target: [checklistAnswers.inspectionId, checklistAnswers.itemId],
          set: { value: p.value, note: p.note, skippedReason: p.skippedReason, captureIds: p.captureIds, answeredAt: new Date(p.answeredAt) },
          setWhere: eq(checklistAnswers.orgId, ctx.orgId),
        });
      return;
    }
    case "gps.batch": {
      const p = op.payload;
      const insp = await ensureInspection(ctx, p.inspectionId, tx);
      // Only route (tracé) inspections keep a GPS track.
      if (!(await tracksRoute(insp.templateId, tx))) return;
      if (p.points.length) {
        for (let i = 0; i < p.points.length; i += 500) {
          await tx
            .insert(gpsPoints)
            .values(
              p.points.slice(i, i + 500).map((pt) => ({
                orgId: ctx.orgId,
                inspectionId: p.inspectionId,
                lat: pt.lat,
                lon: pt.lon,
                accuracy: pt.accuracy,
                recordedAt: new Date(pt.t),
              })),
            )
            .onConflictDoNothing();
        }
      }
      await rebuildTrack(ctx, p.inspectionId, tx);
      effects.push(() => relocateFromTrack(ctx, p.inspectionId));
      return;
    }
  }
}

/** Recompute the inspection's track LineString and length from its raw points. */
export async function rebuildTrack(ctx: OrgCtx, inspectionId: string, tx: Tx | typeof db = db) {
  const pts = await tx
    .select({ lat: gpsPoints.lat, lon: gpsPoints.lon, recordedAt: gpsPoints.recordedAt, accuracy: gpsPoints.accuracy })
    .from(gpsPoints)
    .where(and(eq(gpsPoints.orgId, ctx.orgId), eq(gpsPoints.inspectionId, inspectionId)))
    .orderBy(asc(gpsPoints.recordedAt));
  // Drop very inaccurate fixes from the drawn line (they stay available as raw points).
  const usable = pts.filter((p) => p.accuracy === null || p.accuracy <= 50).map((p) => ({ lat: p.lat, lon: p.lon, t: p.recordedAt.getTime() }));
  const line = trackToLineString(usable);
  await tx
    .insert(gpsTracks)
    .values({ orgId: ctx.orgId, inspectionId, lineGeojson: line, pointCount: pts.length, lengthM: lineLengthMeters(usable) })
    .onConflictDoUpdate({
      target: gpsTracks.inspectionId,
      set: { lineGeojson: line, pointCount: pts.length, lengthM: lineLengthMeters(usable), updatedAt: sql`now()` },
      setWhere: eq(gpsTracks.orgId, ctx.orgId),
    });
}

/** Apply a batch of offline ops. Each op runs in its own transaction. */
export async function applySyncOps(ctx: OrgCtx, ops: SyncOp[]): Promise<SyncOpResult[]> {
  const results: SyncOpResult[] = [];
  for (const op of ops) {
    const effects: SideEffect[] = [];
    try {
      if (ctx.role === "lezer") throw new ForbiddenError("Lezers kunnen geen schouwgegevens vastleggen.");
      await db.transaction((tx) => applyOne(ctx, op, tx, effects));
      results.push({ id: op.id, ok: true });
    } catch (err) {
      const permanent = err instanceof ZodError || err instanceof ForbiddenError || err instanceof NotFoundError || err instanceof PermanentError;
      if (!permanent) console.error("[sync] op failed", op.kind, err);
      results.push({ id: op.id, ok: false, error: err instanceof Error ? err.message : String(err), permanent });
      continue;
    }
    for (const effect of effects) {
      try {
        await effect();
      } catch (err) {
        console.error("[sync] side effect failed", op.kind, err);
      }
    }
  }
  return results;
}

import "server-only";
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type DbOrTx } from "@/db/client";
import { captures, gpsPoints, inspections, inspectionTemplates, templateShots } from "@/db/schema";
import { ForbiddenError, NotFoundError, orgWhere, scoped, type OrgCtx } from "@/db/scope";
import { isInNetherlands, wgs84ToRd } from "@/lib/geo/rd";
import { matchTimestampToTrack, type TrackPoint } from "@/lib/geo/track-matching";
import type { captureUpsertSchema } from "@/lib/sync/ops";

export type CaptureUpsertInput = z.infer<typeof captureUpsertSchema>;

/** Types that get a photo number (fotonummer) in the report. */
const NUMBERED_TYPES = new Set(["photo", "video", "sketch"]);

export function rdFor(lat: number | null | undefined, lon: number | null | undefined) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return { rdX: null, rdY: null };
  if (!isInNetherlands(lat, lon)) return { rdX: null, rdY: null };
  const { x, y } = wgs84ToRd(lat, lon);
  return { rdX: x, rdY: y };
}

/** Whether the template is a route (tracé) inspection; others use one inspection location. */
export async function tracksRoute(templateId: string, conn: DbOrTx = db) {
  const [tpl] = await conn.select({ tracksRoute: inspectionTemplates.tracksRoute }).from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).limit(1);
  return tpl?.tracksRoute ?? false;
}

export async function loadTrack(orgId: string, inspectionId: string, conn: DbOrTx = db): Promise<TrackPoint[]> {
  const pts = await conn
    .select({ lat: gpsPoints.lat, lon: gpsPoints.lon, recordedAt: gpsPoints.recordedAt, accuracy: gpsPoints.accuracy })
    .from(gpsPoints)
    .where(and(eq(gpsPoints.orgId, orgId), eq(gpsPoints.inspectionId, inspectionId)))
    .orderBy(asc(gpsPoints.recordedAt));
  return pts.map((p) => ({ lat: p.lat, lon: p.lon, t: p.recordedAt.getTime(), accuracy: p.accuracy }));
}

/**
 * Idempotently create or update a capture. Used by the offline sync, the
 * smart-glasses ingest API and bulk import. Returns whether it was created
 * (so the caller can enqueue AI processing once).
 */
export async function upsertCapture(ctx: OrgCtx, input: CaptureUpsertInput, conn: DbOrTx = db) {
  const s = scoped(ctx, conn);
  const insp = input.inspectionId ? await s.findById(inspections, input.inspectionId) : null;
  if (input.inspectionId && !insp) throw new NotFoundError("Schouw niet gevonden.");
  if (input.shotId) await s.assertOwned(templateShots, [input.shotId]);

  let { lat, lon, locationSource, accuracy } = input;
  if (insp && input.locationSource !== "manual" && !(await tracksRoute(insp.templateId, conn))) {
    // Location inspection: every capture sits on the single inspection location.
    if (insp.lat !== null && insp.lon !== null) {
      lat = insp.lat;
      lon = insp.lon;
      accuracy = null;
      locationSource = "inspection";
    } else if (lat !== null && lon !== null) {
      // No start location yet: the first located capture fixes it.
      await conn.update(inspections).set({ lat, lon }).where(orgWhere(inspections, ctx, eq(inspections.id, insp.id)));
    }
  } else if ((lat === null || lon === null) && input.inspectionId) {
    const track = await loadTrack(ctx.orgId, input.inspectionId, conn);
    const m = matchTimestampToTrack(track, Date.parse(input.capturedAt));
    if (m) {
      lat = m.lat;
      lon = m.lon;
      locationSource = "track-match";
    }
  }
  if (lat === null || lon === null) locationSource = input.locationSource === "manual" ? "manual" : "none";
  const rd = rdFor(lat, lon);

  const [existing] = await conn.select().from(captures).where(eq(captures.id, input.id)).limit(1);
  if (existing && existing.orgId !== ctx.orgId) throw new ForbiddenError("Capture-id is al in gebruik.");

  const values = {
    inspectionId: input.inspectionId,
    type: input.type,
    blobUrl: input.blobUrl,
    thumbUrl: input.thumbUrl,
    mime: input.mime,
    size: input.size,
    durationMs: input.durationMs,
    lat,
    lon,
    accuracy,
    heading: input.heading,
    ...rd,
    locationSource,
    capturedAt: new Date(input.capturedAt),
    source: input.source,
    shotId: input.shotId,
    tags: input.tags,
    note: input.note,
    textContent: input.textContent,
    parentCaptureId: input.parentCaptureId,
    meta: input.meta ?? {},
    exif: input.exif ?? null,
    deviceId: input.deviceId ?? null,
  };

  if (existing) {
    const [updated] = await conn
      .update(captures)
      .set({
        ...values,
        // Never lose an uploaded file on a replay without URL.
        blobUrl: values.blobUrl ?? existing.blobUrl,
        thumbUrl: values.thumbUrl ?? existing.thumbUrl,
        // Keep manual location corrections made in the backend.
        ...(existing.locationSource === "manual" ? { lat: existing.lat, lon: existing.lon, rdX: existing.rdX, rdY: existing.rdY, locationSource: "manual" as const } : {}),
      })
      .where(orgWhere(captures, ctx, eq(captures.id, input.id)))
      .returning();
    return { capture: updated!, created: false };
  }

  let seq: number | null = null;
  if (input.inspectionId && NUMBERED_TYPES.has(input.type)) {
    // Serialise numbering per inspection.
    await conn.execute(sql`select pg_advisory_xact_lock(hashtext(${input.inspectionId}))`);
    const [row] = await conn
      .select({ m: max(captures.seq) })
      .from(captures)
      .where(and(eq(captures.orgId, ctx.orgId), eq(captures.inspectionId, input.inspectionId)));
    seq = (row?.m ?? 0) + 1;
  }
  const [created] = await conn
    .insert(captures)
    .values({ ...values, id: input.id, orgId: ctx.orgId, seq, createdBy: ctx.userId })
    .returning();
  return { capture: created!, created: true };
}

/** Fill in missing capture locations from the (updated) GPS track. */
export async function relocateFromTrack(ctx: OrgCtx, inspectionId: string, conn: DbOrTx = db) {
  const missing = await conn
    .select({ id: captures.id, capturedAt: captures.capturedAt })
    .from(captures)
    .where(orgWhere(captures, ctx, eq(captures.inspectionId, inspectionId), isNull(captures.lat)));
  if (missing.length === 0) return 0;
  const track = await loadTrack(ctx.orgId, inspectionId, conn);
  if (track.length === 0) return 0;
  let n = 0;
  for (const c of missing) {
    const m = matchTimestampToTrack(track, c.capturedAt.getTime());
    if (!m) continue;
    await conn
      .update(captures)
      .set({ lat: m.lat, lon: m.lon, ...rdFor(m.lat, m.lon), locationSource: "track-match" })
      .where(orgWhere(captures, ctx, eq(captures.id, c.id)));
    n++;
  }
  return n;
}

/** Renumber photo numbers of an inspection in capture-time order. */
export async function renumberCaptures(ctx: OrgCtx, inspectionId: string, conn: DbOrTx = db) {
  const rows = await conn
    .select({ id: captures.id })
    .from(captures)
    .where(orgWhere(captures, ctx, eq(captures.inspectionId, inspectionId), inArray(captures.type, ["photo", "video", "sketch"])))
    .orderBy(asc(captures.capturedAt));
  for (const [i, r] of rows.entries()) {
    await conn.update(captures).set({ seq: i + 1 }).where(eq(captures.id, r.id));
  }
}

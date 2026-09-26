import "server-only";
import { and, desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db/client";
import { inspections, type Device } from "@/db/schema";
import { ForbiddenError, type OrgCtx } from "@/db/scope";
import { enqueueCaptureProcessing } from "@/lib/ai/enqueue";
import { readExif } from "@/lib/geo/exif";
import { extensionFor, putObject, belongsToOrg, pathnameOf } from "@/lib/storage";
import { upsertCapture } from "./persist";
import type { CaptureSource } from "./types";
import type { CaptureSourceKind, CaptureType } from "@/lib/domain";

/** Server-side capture source for camera glasses that sync through a companion app. */
export class GlassesIngestSource implements CaptureSource {
  readonly kind: CaptureSourceKind = "glasses-ingest";
  readonly label = "Smart glasses (koppeling via companion-app)";
  async isAvailable() {
    return true;
  }
}

export const ingestMetaSchema = z.object({
  clientId: z.string().uuid().optional(),
  type: z.enum(["photo", "video", "audio"]).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  deviceId: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  durationMs: z.coerce.number().int().min(0).optional(),
  inspectionId: z.string().uuid().optional(),
});
export type IngestMeta = z.infer<typeof ingestMetaSchema>;

function inferType(mime: string, fallback?: CaptureType): CaptureType {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return fallback ?? "photo";
}

/** The inspection a device's captures belong to: the user's running inspection (most recent). */
export async function activeInspectionFor(ctx: OrgCtx, at: Date) {
  const rows = await db
    .select({ id: inspections.id, startedAt: inspections.startedAt, title: inspections.title })
    .from(inspections)
    .where(and(eq(inspections.orgId, ctx.orgId), eq(inspections.inspectorId, ctx.userId!), eq(inspections.status, "lopend")))
    .orderBy(desc(inspections.startedAt))
    .limit(5);
  return rows.find((r) => r.startedAt.getTime() <= at.getTime() + 5 * 60_000) ?? rows[0] ?? null;
}

/**
 * Store one capture coming from glasses (or a file import on the server):
 * - lands in the active inspection of the device's user, or in the inbox;
 * - location from metadata, else EXIF, else matched on the phone's GPS track.
 */
export async function ingestCapture(
  ctx: OrgCtx,
  input: {
    meta: IngestMeta;
    file?: { buffer: Buffer; mime: string; name: string } | null;
    storedUrl?: string | null;
    mime?: string | null;
    source: CaptureSourceKind;
    device?: Device | null;
    /** Always put the capture in the inbox (backend import to inbox). */
    forceInbox?: boolean;
  },
) {
  const id = input.meta.clientId ?? crypto.randomUUID();
  const mime = input.file?.mime ?? input.mime ?? "application/octet-stream";
  const type = input.meta.type ?? inferType(mime);
  let capturedAt = input.meta.capturedAt ? new Date(input.meta.capturedAt) : null;
  let lat = input.meta.lat ?? null;
  let lon = input.meta.lon ?? null;
  let heading = input.meta.heading ?? null;
  let locationSource: "gps" | "exif" | "none" = lat !== null && lon !== null ? "gps" : "none";
  let exifRaw: Record<string, unknown> | null = null;
  if (input.file && type === "photo") {
    const exif = await readExif(input.file.buffer);
    if (exif) {
      exifRaw = exif.raw;
      capturedAt ??= exif.takenAt;
      if (lat === null && exif.lat !== null) {
        lat = exif.lat;
        lon = exif.lon;
        locationSource = "exif";
      }
      heading ??= exif.heading;
    }
  }
  capturedAt ??= new Date();

  const target = input.forceInbox ? null : input.meta.inspectionId ? { id: input.meta.inspectionId } : await activeInspectionFor(ctx, capturedAt);
  const inspectionId = target?.id ?? null;
  const dir = `orgs/${ctx.orgId}/${inspectionId ? `inspections/${inspectionId}` : "inbox"}`;

  let blobUrl = input.storedUrl ?? null;
  let thumbUrl: string | null = null;
  let width: number | undefined;
  let height: number | undefined;
  if (blobUrl && !belongsToOrg(blobUrl, ctx.orgId)) throw new ForbiddenError("Bestandsverwijzing hoort niet bij deze organisatie.");
  if (input.file) {
    const stored = await putObject(`${dir}/${id}-orig.${extensionFor(mime)}`, input.file.buffer, mime);
    blobUrl = stored.url;
    if (type === "photo") {
      const thumb = await sharp(input.file.buffer).rotate().resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 78 }).toBuffer({ resolveWithObject: true }).catch(() => null);
      if (thumb) {
        thumbUrl = (await putObject(`${dir}/${id}-thumb.jpg`, thumb.data, "image/jpeg")).url;
        const meta = await sharp(input.file.buffer).metadata().catch(() => null);
        width = meta?.width;
        height = meta?.height;
      }
    }
  }
  const { capture, created } = await upsertCapture(ctx, {
    id,
    inspectionId,
    type,
    blobUrl,
    thumbUrl,
    mime,
    size: input.file?.buffer.byteLength ?? null,
    durationMs: input.meta.durationMs ?? null,
    lat,
    lon,
    accuracy: input.meta.accuracy ?? null,
    heading,
    locationSource,
    capturedAt: capturedAt.toISOString(),
    source: input.source,
    shotId: null,
    tags: input.source === "glasses-ingest" ? ["smart-glasses"] : [],
    note: input.meta.note ?? null,
    textContent: null,
    parentCaptureId: null,
    meta: { fileName: input.file?.name ?? (blobUrl ? pathnameOf(blobUrl).split("/").pop() : undefined), width, height },
    exif: exifRaw,
    deviceId: input.device?.id ?? null,
  });
  if (created) await enqueueCaptureProcessing(ctx, capture);
  return {
    captureId: capture.id,
    created,
    status: inspectionId ? ("assigned" as const) : ("inbox" as const),
    inspectionId,
    inspectionTitle: target && "title" in target ? (target.title as string) : null,
    location: { lat: capture.lat, lon: capture.lon, source: capture.locationSource },
  };
}

import { z } from "zod";
import {
  CAPTURE_SOURCES,
  CAPTURE_TYPES,
  FINDING_CATEGORIES,
  LOCATION_SOURCES,
  PRIORITIES,
} from "../domain";

/**
 * Offline outbox operations. The field app records every change as an op in
 * IndexedDB; the sync engine replays them against POST /api/sync. Every op is
 * idempotent on the server (client-generated UUIDs + upserts), so replaying
 * after a network failure never duplicates data.
 */

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const nullableNum = z.number().finite().nullable();

export const weatherSchema = z
  .object({
    temperatureC: nullableNum,
    precipitationMm: nullableNum,
    windSpeedKmh: nullableNum,
    windDirectionDeg: nullableNum,
    humidity: nullableNum,
    weatherCode: nullableNum,
    description: z.string(),
    observedAt: z.string(),
    source: z.enum(["open-meteo", "handmatig"]),
  })
  .nullable();

export const inspectionUpsertSchema = z.object({
  id: uuid,
  templateId: uuid,
  projectId: uuid.nullable(),
  stationId: uuid.nullable(),
  newStation: z
    .object({
      id: uuid,
      code: z.string().min(1),
      name: z.string().min(1),
      stationType: z.string().nullable(),
      lat: nullableNum,
      lon: nullableNum,
      address: z.string().nullable(),
    })
    .nullable()
    .optional(),
  title: z.string().min(1).max(300),
  startedAt: isoDate,
  weather: weatherSchema.optional(),
  address: z.string().nullable().optional(),
  lat: nullableNum.optional(),
  lon: nullableNum.optional(),
  deviceInfo: z.record(z.string(), z.string()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const inspectionFinishSchema = z.object({
  id: uuid,
  endedAt: isoDate,
  skipped: z.array(z.object({ kind: z.enum(["shot", "checklist"]), refId: z.string(), reason: z.string().min(1) })),
  notes: z.string().nullable().optional(),
});

export const participantUpsertSchema = z.object({
  id: uuid,
  inspectionId: uuid,
  name: z.string().min(1).max(200),
  organization: z.string().nullable(),
  role: z.string().nullable(),
  signatureUrl: z.string().nullable().optional(),
  signedAt: isoDate.nullable().optional(),
});

export const captureUpsertSchema = z.object({
  id: uuid,
  inspectionId: uuid.nullable(),
  type: z.enum(CAPTURE_TYPES),
  blobUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  mime: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  lat: nullableNum,
  lon: nullableNum,
  accuracy: nullableNum,
  heading: nullableNum,
  locationSource: z.enum(LOCATION_SOURCES),
  capturedAt: isoDate,
  source: z.enum(CAPTURE_SOURCES),
  shotId: uuid.nullable(),
  tags: z.array(z.string().max(60)).max(30),
  note: z.string().max(5000).nullable(),
  textContent: z.string().max(20000).nullable(),
  parentCaptureId: uuid.nullable(),
  meta: z
    .object({
      keyframes: z.array(z.object({ url: z.string(), offsetMs: z.number() })).optional(),
      scanFormat: z.string().optional(),
      seriesId: z.string().optional(),
      track: z.array(z.object({ lat: z.number(), lon: z.number(), t: z.number() })).optional(),
      fileName: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      baseCaptureId: z.string().optional(),
    })
    .default({}),
  exif: z.record(z.string(), z.unknown()).nullable().optional(),
  deviceId: uuid.nullable().optional(),
});

export const captureUpdateSchema = z.object({
  id: uuid,
  patch: z
    .object({
      lat: nullableNum,
      lon: nullableNum,
      locationSource: z.enum(LOCATION_SOURCES),
      note: z.string().max(5000).nullable(),
      tags: z.array(z.string().max(60)).max(30),
      shotId: uuid.nullable(),
      hiddenInReport: z.boolean(),
    })
    .partial(),
});

export const captureDeleteSchema = z.object({ id: uuid });

export const measurementUpsertSchema = z.object({
  id: uuid,
  inspectionId: uuid,
  captureId: uuid.nullable(),
  photoCaptureId: uuid.nullable(),
  kind: z.string().min(1).max(40),
  label: z.string().min(1).max(200),
  value: z.number().finite(),
  unit: z.string().min(1).max(20),
  lat: nullableNum,
  lon: nullableNum,
  measuredAt: isoDate,
});

export const findingUpsertSchema = z.object({
  id: uuid,
  inspectionId: uuid,
  title: z.string().min(1).max(300),
  description: z.string().max(5000),
  category: z.enum(FINDING_CATEGORIES),
  priority: z.enum(PRIORITIES),
  lat: nullableNum,
  lon: nullableNum,
  captureIds: z.array(uuid).max(100),
  recommendation: z.string().max(5000).nullable().optional(),
});

export const checklistUpsertSchema = z.object({
  inspectionId: uuid,
  itemId: uuid,
  value: z.union([z.string().max(5000), z.number(), z.null()]),
  note: z.string().max(5000).nullable(),
  skippedReason: z.string().max(1000).nullable(),
  captureIds: z.array(uuid).max(50),
  answeredAt: isoDate,
});

export const gpsBatchSchema = z.object({
  inspectionId: uuid,
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        accuracy: nullableNum,
        t: z.number().int(),
      }),
    )
    .max(5000),
});

export const syncOpSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("inspection.upsert"), payload: inspectionUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("inspection.finish"), payload: inspectionFinishSchema }),
  z.object({ id: z.string(), kind: z.literal("participant.upsert"), payload: participantUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("capture.upsert"), payload: captureUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("capture.update"), payload: captureUpdateSchema }),
  z.object({ id: z.string(), kind: z.literal("capture.delete"), payload: captureDeleteSchema }),
  z.object({ id: z.string(), kind: z.literal("measurement.upsert"), payload: measurementUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("finding.upsert"), payload: findingUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("checklist.upsert"), payload: checklistUpsertSchema }),
  z.object({ id: z.string(), kind: z.literal("gps.batch"), payload: gpsBatchSchema }),
]);
export type SyncOp = z.infer<typeof syncOpSchema>;
export type SyncOpKind = SyncOp["kind"];
export type SyncOpPayload<K extends SyncOpKind> = Extract<SyncOp, { kind: K }>["payload"];

export const syncRequestSchema = z.object({ ops: z.array(syncOpSchema).min(1).max(200) });

export type SyncOpResult = { id: string; ok: true } | { id: string; ok: false; error: string; permanent: boolean };
export type SyncResponse = { results: SyncOpResult[]; serverTime: string };

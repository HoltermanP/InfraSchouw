import { getLocalDb, type LocalCapture, type LocalInspection } from "./db";
import { enqueueOp, type OutboxFile } from "./outbox";
import { extFromMime } from "../media/client";
import type { CaptureDraft } from "../capture-sources/types";
import type { FindingCategory, Priority } from "../domain";
import type { Weather } from "../geo/weather";

/**
 * Local-first persistence for the field app. Every action writes to
 * IndexedDB (visible immediately, also offline) and records an outbox op.
 */

export type FieldIdentity = { orgId: string; userId: string };

function base(identity: FieldIdentity, inspectionId: string | null) {
  return `orgs/${identity.orgId}/inspections/${inspectionId ?? "inbox"}`;
}

export async function createLocalInspection(
  identity: FieldIdentity,
  input: {
    id?: string;
    templateId: string;
    projectId: string | null;
    stationId: string | null;
    newStation?: { id: string; code: string; name: string; stationType: string | null; lat: number | null; lon: number | null; address: string | null } | null;
    title: string;
    weather: Weather | null;
    address: string | null;
    lat: number | null;
    lon: number | null;
    participants: { name: string; organization: string | null; role: string | null }[];
  },
) {
  const db = getLocalDb();
  const id = input.id ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const local: LocalInspection = {
    id,
    orgId: identity.orgId,
    userId: identity.userId,
    templateId: input.templateId,
    projectId: input.projectId,
    stationId: input.stationId ?? input.newStation?.id ?? null,
    title: input.title,
    status: "lopend",
    startedAt,
    endedAt: null,
    weather: input.weather,
    address: input.address,
    lat: input.lat,
    lon: input.lon,
    notes: null,
    skipped: [],
    updatedAt: Date.now(),
  };
  await db.inspections.put(local);
  await enqueueOp({
    kind: "inspection.upsert",
    inspectionId: id,
    payload: {
      id,
      templateId: input.templateId,
      projectId: input.projectId,
      stationId: input.stationId,
      newStation: input.newStation ?? null,
      title: input.title,
      startedAt,
      weather: input.weather,
      address: input.address,
      lat: input.lat,
      lon: input.lon,
      deviceInfo: {
        userAgent: navigator.userAgent.slice(0, 300),
        platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "",
        screen: `${screen.width}x${screen.height}`,
      },
    },
  });
  for (const p of input.participants) await saveParticipant(identity, { inspectionId: id, ...p });
  return local;
}

export async function updateLocalInspection(id: string, patch: Partial<Pick<LocalInspection, "title" | "notes" | "weather" | "address" | "lat" | "lon">>) {
  const db = getLocalDb();
  const current = await db.inspections.get(id);
  if (!current) return;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await db.inspections.put(next);
  await enqueueOp({
    kind: "inspection.upsert",
    inspectionId: id,
    payload: {
      id,
      templateId: next.templateId,
      projectId: next.projectId,
      stationId: next.stationId,
      title: next.title,
      startedAt: next.startedAt,
      weather: next.weather,
      address: next.address,
      lat: next.lat,
      lon: next.lon,
      notes: next.notes,
    },
  });
}

/** Store a capture draft (from any capture source) locally and queue its upload. */
export async function saveCapture(identity: FieldIdentity, inspectionId: string | null, draft: CaptureDraft): Promise<LocalCapture> {
  const db = getLocalDb();
  const dir = base(identity, inspectionId);
  const files: OutboxFile[] = [];
  let fileId: string | null = null;
  let thumbFileId: string | null = null;
  if (draft.blob) {
    fileId = crypto.randomUUID();
    const mime = draft.mime || draft.blob.type || "application/octet-stream";
    files.push({ path: "blobUrl", id: fileId, blob: draft.blob, name: `${draft.id}.${extFromMime(mime)}`, mime, pathname: `${dir}/${draft.id}-orig.${extFromMime(mime)}` });
  }
  if (draft.thumb) {
    thumbFileId = crypto.randomUUID();
    files.push({ path: "thumbUrl", id: thumbFileId, blob: draft.thumb, name: `${draft.id}-thumb.jpg`, mime: "image/jpeg", pathname: `${dir}/${draft.id}-thumb.jpg` });
  }
  const keyframes = (draft.keyframes ?? []).map((kf, i) => {
    files.push({ path: `meta.keyframes.${i}.url`, blob: kf.blob, name: `${draft.id}-kf${i}.jpg`, mime: "image/jpeg", pathname: `${dir}/${draft.id}-kf${i}.jpg` });
    return { url: "", offsetMs: kf.offsetMs };
  });
  const meta = { ...(draft.meta ?? {}), ...(keyframes.length ? { keyframes } : {}) };
  const local: LocalCapture = {
    id: draft.id,
    inspectionId,
    type: draft.type,
    status: "pending",
    fileId,
    thumbFileId,
    mime: draft.mime ?? draft.blob?.type ?? null,
    size: draft.blob?.size ?? null,
    durationMs: draft.durationMs ?? null,
    lat: draft.lat,
    lon: draft.lon,
    accuracy: draft.accuracy,
    heading: draft.heading,
    locationSource: draft.locationSource,
    capturedAt: draft.capturedAt.toISOString(),
    source: draft.source,
    shotId: draft.shotId ?? null,
    tags: draft.tags ?? [],
    note: draft.note ?? null,
    textContent: draft.textContent ?? null,
    parentCaptureId: draft.parentCaptureId ?? null,
    meta,
    error: null,
  };
  await db.captures.put(local);
  await enqueueOp({
    kind: "capture.upsert",
    inspectionId,
    files,
    payload: {
      id: local.id,
      inspectionId,
      type: local.type,
      blobUrl: null,
      thumbUrl: null,
      mime: local.mime,
      size: local.size,
      durationMs: local.durationMs,
      lat: local.lat,
      lon: local.lon,
      accuracy: local.accuracy,
      heading: local.heading,
      locationSource: local.locationSource,
      capturedAt: local.capturedAt,
      source: local.source,
      shotId: local.shotId,
      tags: local.tags,
      note: local.note,
      textContent: local.textContent,
      parentCaptureId: local.parentCaptureId,
      meta,
      exif: draft.exif ?? null,
    },
  });
  return local;
}

export async function updateCapture(
  id: string,
  patch: Partial<Pick<LocalCapture, "lat" | "lon" | "locationSource" | "note" | "tags" | "shotId">>,
) {
  const db = getLocalDb();
  const c = await db.captures.get(id);
  if (!c) return;
  await db.captures.update(id, patch);
  await enqueueOp({ kind: "capture.update", inspectionId: c.inspectionId, payload: { id, patch } });
}

export async function deleteCapture(id: string) {
  const db = getLocalDb();
  const c = await db.captures.get(id);
  if (!c) return;
  await db.captures.delete(id);
  await enqueueOp({ kind: "capture.delete", inspectionId: c.inspectionId, payload: { id } });
}

export async function saveMeasurement(
  identity: FieldIdentity,
  inspectionId: string,
  input: { kind: string; label: string; value: number; unit: string; photoCaptureId: string | null; lat: number | null; lon: number | null; accuracy: number | null },
) {
  const db = getLocalDb();
  const captureId = crypto.randomUUID();
  const now = new Date();
  await saveCapture(identity, inspectionId, {
    id: captureId,
    type: "measurement",
    source: "phone-camera",
    capturedAt: now,
    lat: input.lat,
    lon: input.lon,
    accuracy: input.accuracy,
    heading: null,
    locationSource: input.lat !== null ? "gps" : "none",
    textContent: `${input.label}: ${input.value} ${input.unit}`,
    parentCaptureId: input.photoCaptureId,
  });
  const id = crypto.randomUUID();
  const m = { id, inspectionId, captureId, photoCaptureId: input.photoCaptureId, kind: input.kind, label: input.label, value: input.value, unit: input.unit, lat: input.lat, lon: input.lon, measuredAt: now.toISOString() };
  await db.measurements.put(m);
  await enqueueOp({ kind: "measurement.upsert", inspectionId, payload: m });
  return m;
}

export async function saveFinding(
  inspectionId: string,
  input: { id?: string; title: string; description: string; category: FindingCategory; priority: Priority; lat: number | null; lon: number | null; captureIds: string[] },
) {
  const db = getLocalDb();
  const f = { id: input.id ?? crypto.randomUUID(), inspectionId, ...input, createdAt: new Date().toISOString() };
  await db.findings.put(f);
  await enqueueOp({
    kind: "finding.upsert",
    inspectionId,
    payload: { id: f.id, inspectionId, title: f.title, description: f.description, category: f.category, priority: f.priority, lat: f.lat, lon: f.lon, captureIds: f.captureIds },
  });
  return f;
}

export async function answerChecklist(
  inspectionId: string,
  itemId: string,
  input: { value: string | number | null; note: string | null; skippedReason: string | null; captureIds: string[] },
) {
  const db = getLocalDb();
  const answeredAt = new Date().toISOString();
  await db.answers.put({ key: `${inspectionId}:${itemId}`, inspectionId, itemId, ...input, answeredAt });
  await enqueueOp({ kind: "checklist.upsert", inspectionId, payload: { inspectionId, itemId, ...input, answeredAt } });
}

export async function saveParticipant(
  identity: FieldIdentity,
  input: { id?: string; inspectionId: string; name: string; organization: string | null; role: string | null; signature?: Blob | null },
) {
  const db = getLocalDb();
  const id = input.id ?? crypto.randomUUID();
  const existing = await db.participants.get(id);
  let signatureFileId = existing?.signatureFileId ?? null;
  const files: OutboxFile[] = [];
  if (input.signature) {
    signatureFileId = crypto.randomUUID();
    files.push({ path: "signatureUrl", id: signatureFileId, blob: input.signature, name: `sig-${id}.png`, mime: "image/png", pathname: `${base(identity, input.inspectionId)}/sig-${id}.png` });
  }
  const signedAt = input.signature ? new Date().toISOString() : (existing?.signedAt ?? null);
  await db.participants.put({ id, inspectionId: input.inspectionId, name: input.name, organization: input.organization, role: input.role, signatureFileId, signedAt });
  await enqueueOp({
    kind: "participant.upsert",
    inspectionId: input.inspectionId,
    files,
    payload: { id, inspectionId: input.inspectionId, name: input.name, organization: input.organization, role: input.role, ...(input.signature ? { signatureUrl: null, signedAt } : {}) },
  });
}

export async function finishInspection(inspectionId: string, skipped: { kind: "shot" | "checklist"; refId: string; reason: string }[], notes: string | null) {
  const db = getLocalDb();
  const endedAt = new Date().toISOString();
  await db.inspections.update(inspectionId, { status: "afgerond", endedAt, skipped, notes, updatedAt: Date.now() });
  await enqueueOp({ kind: "inspection.finish", inspectionId, payload: { id: inspectionId, endedAt, skipped, notes } });
}

export async function logGpsPoint(inspectionId: string, fix: { lat: number; lon: number; accuracy: number | null; t: number }) {
  await getLocalDb().gpsPoints.add({ inspectionId, ...fix, synced: 0 });
}

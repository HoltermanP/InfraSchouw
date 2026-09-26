import Dexie, { type EntityTable } from "dexie";
import type { CaptureSourceKind, CaptureType, LocationSource } from "../domain";
import type { SyncOpKind } from "../sync/ops";

/**
 * Local IndexedDB store for the field app (works in window and service
 * worker contexts). Everything captured in the field is written here first;
 * the sync engine replays the outbox (`ops`) to the server.
 */

export type LocalFileStatus = "pending" | "uploading" | "uploaded" | "error";
export type LocalFile = {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
  /** Target pathname in storage (orgs/<org>/...). */
  pathname: string;
  status: LocalFileStatus;
  url: string | null;
  attempts: number;
  error: string | null;
  createdAt: number;
};

export type OpStatus = "pending" | "processing" | "done" | "error";
export type LocalOp = {
  seq?: number;
  id: string;
  kind: SyncOpKind;
  payload: Record<string, unknown>;
  /** Payload paths (dotted) that must be replaced by the uploaded file URL. */
  fileRefs: Record<string, string>;
  status: OpStatus;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  permanent: boolean;
  createdAt: number;
  inspectionId: string | null;
};

export type CaptureSyncStatus = "pending" | "uploading" | "uploaded" | "processed" | "error";
export type LocalCapture = {
  id: string;
  inspectionId: string | null;
  type: CaptureType;
  status: CaptureSyncStatus;
  fileId: string | null;
  thumbFileId: string | null;
  mime: string | null;
  size: number | null;
  durationMs: number | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  heading: number | null;
  locationSource: LocationSource;
  capturedAt: string;
  source: CaptureSourceKind;
  shotId: string | null;
  tags: string[];
  note: string | null;
  textContent: string | null;
  parentCaptureId: string | null;
  meta: Record<string, unknown>;
  error: string | null;
};

export type LocalInspection = {
  id: string;
  orgId: string;
  userId: string;
  templateId: string;
  projectId: string | null;
  stationId: string | null;
  title: string;
  status: "lopend" | "afgerond";
  startedAt: string;
  endedAt: string | null;
  weather: unknown;
  address: string | null;
  lat: number | null;
  lon: number | null;
  notes: string | null;
  skipped: { kind: "shot" | "checklist"; refId: string; reason: string }[];
  updatedAt: number;
};

export type LocalChecklistAnswer = {
  key: string; // `${inspectionId}:${itemId}`
  inspectionId: string;
  itemId: string;
  value: string | number | null;
  note: string | null;
  skippedReason: string | null;
  captureIds: string[];
  answeredAt: string;
};

export type LocalFinding = {
  id: string;
  inspectionId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  lat: number | null;
  lon: number | null;
  captureIds: string[];
  createdAt: string;
};

export type LocalMeasurement = {
  id: string;
  inspectionId: string;
  captureId: string | null;
  photoCaptureId: string | null;
  kind: string;
  label: string;
  value: number;
  unit: string;
  lat: number | null;
  lon: number | null;
  measuredAt: string;
};

export type LocalParticipant = {
  id: string;
  inspectionId: string;
  name: string;
  organization: string | null;
  role: string | null;
  signatureFileId: string | null;
  signedAt: string | null;
};

export type LocalGpsPoint = {
  id?: number;
  inspectionId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  t: number;
  synced: 0 | 1;
};

export type KeyValue = { key: string; value: unknown; updatedAt: number };

export class InfraSchouwDb extends Dexie {
  files!: EntityTable<LocalFile, "id">;
  ops!: EntityTable<LocalOp, "seq">;
  captures!: EntityTable<LocalCapture, "id">;
  inspections!: EntityTable<LocalInspection, "id">;
  answers!: EntityTable<LocalChecklistAnswer, "key">;
  findings!: EntityTable<LocalFinding, "id">;
  measurements!: EntityTable<LocalMeasurement, "id">;
  participants!: EntityTable<LocalParticipant, "id">;
  gpsPoints!: EntityTable<LocalGpsPoint, "id">;
  kv!: EntityTable<KeyValue, "key">;

  constructor(name = "infraschouw") {
    super(name);
    this.version(1).stores({
      files: "id, status, createdAt",
      ops: "++seq, &id, status, nextAttemptAt, inspectionId",
      captures: "id, inspectionId, status, capturedAt, type",
      inspections: "id, status, userId, updatedAt",
      answers: "key, inspectionId",
      findings: "id, inspectionId",
      measurements: "id, inspectionId",
      participants: "id, inspectionId",
      gpsPoints: "++id, inspectionId, synced, t",
      kv: "key",
    });
  }
}

let instance: InfraSchouwDb | null = null;
export function getLocalDb(): InfraSchouwDb {
  instance ??= new InfraSchouwDb();
  return instance;
}
/** For tests: swap the database instance. */
export function setLocalDb(db: InfraSchouwDb | null) {
  instance = db;
}

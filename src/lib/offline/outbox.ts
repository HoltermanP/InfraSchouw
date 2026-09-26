import { getLocalDb, type InfraSchouwDb, type LocalOp } from "./db";
import type { SyncOpKind } from "../sync/ops";

export type OutboxFile = { path: string; id?: string; blob: Blob; name: string; pathname: string; mime?: string };

/**
 * Record a change in the offline outbox. Files are stored in IndexedDB and
 * uploaded by the sync engine just before the op is sent.
 */
export async function enqueueOp(
  input: { kind: SyncOpKind; payload: Record<string, unknown>; inspectionId: string | null; files?: OutboxFile[] },
  db: InfraSchouwDb = getLocalDb(),
): Promise<LocalOp> {
  const now = Date.now();
  const fileRefs: Record<string, string> = {};
  for (const f of input.files ?? []) {
    const id = f.id ?? crypto.randomUUID();
    await db.files.put({
      id,
      blob: f.blob,
      name: f.name,
      mime: f.mime ?? (f.blob.type || "application/octet-stream"),
      pathname: f.pathname,
      status: "pending",
      url: null,
      attempts: 0,
      error: null,
      createdAt: now,
    });
    fileRefs[f.path] = id;
  }
  const op: LocalOp = {
    id: crypto.randomUUID(),
    kind: input.kind,
    payload: input.payload,
    fileRefs,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
    permanent: false,
    createdAt: now,
    inspectionId: input.inspectionId,
  };
  const seq = await db.ops.add(op);
  const saved = { ...op, seq: seq as number };
  requestSync();
  return saved;
}

/** Ask for a sync soon: Background Sync if available, otherwise an event for the page runner. */
export function requestSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("infraschouw:sync-requested"));
  const nav = navigator as Navigator & { serviceWorker?: ServiceWorkerContainer };
  nav.serviceWorker?.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("infraschouw-sync"))
    .catch(() => undefined);
}

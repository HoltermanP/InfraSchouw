import { getLocalDb, type InfraSchouwDb, type LocalOp } from "./db";
import { UnauthorizedError, uploadFile } from "./upload";
import type { SyncResponse } from "../sync/ops";

/**
 * Sync engine: replays the offline outbox against the server in strict FIFO
 * order. Runs in the page (online event, app focus, interval) and in the
 * service worker (Background Sync). A Web Lock guarantees only one runner
 * at a time across tabs and the worker.
 */

export type SyncRunResult = {
  status: "ok" | "partial" | "offline" | "unauthorized" | "busy";
  sent: number;
  failed: number;
  pending: number;
  message?: string;
};

type Options = {
  origin: string;
  reason: string;
  fetchImpl?: typeof fetch;
  db?: InfraSchouwDb;
  now?: () => number;
};

const BATCH_SIZE = 25;
const LOCK_NAME = "infraschouw-sync";

export function backoffMs(attempts: number): number {
  const base = Math.min(2 ** attempts * 2000, 5 * 60_000);
  return base + Math.floor(Math.random() * 1000);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cursor: Record<string, unknown> = obj;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) cursor[key] = value;
    else {
      if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = /^\d+$/.test(keys[i + 1]!) ? [] : {};
      cursor = cursor[key] as Record<string, unknown>;
    }
  });
}

async function withLock<T>(fn: () => Promise<T>, busy: T): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks?.request) return fn();
  return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => (lock ? fn() : busy));
}

export async function countPending(db: InfraSchouwDb = getLocalDb()) {
  const [ops, gps] = await Promise.all([
    db.ops.where("status").anyOf("pending", "processing").count(),
    db.gpsPoints.where("synced").equals(0).count(),
  ]);
  return { ops, gps, total: ops };
}

export async function runSync(opts: Options): Promise<SyncRunResult> {
  const busy: SyncRunResult = { status: "busy", sent: 0, failed: 0, pending: 0 };
  return withLock(() => doSync(opts), busy);
}

async function uploadRefs(op: LocalOp, opts: Required<Pick<Options, "origin" | "fetchImpl">>, db: InfraSchouwDb) {
  const payload = structuredClone(op.payload);
  for (const [path, fileId] of Object.entries(op.fileRefs)) {
    const file = await db.files.get(fileId);
    if (!file) {
      setPath(payload, path, null);
      continue;
    }
    if (file.status !== "uploaded" || !file.url) {
      await db.files.update(fileId, { status: "uploading" });
      if (op.kind === "capture.upsert") await db.captures.update(String(payload.id), { status: "uploading" });
      try {
        const url = await uploadFile(opts.origin, file, undefined, opts.fetchImpl);
        await db.files.update(fileId, { status: "uploaded", url, error: null });
        file.url = url;
      } catch (err) {
        await db.files.update(fileId, { status: "error", attempts: file.attempts + 1, error: String(err) });
        throw err;
      }
    }
    setPath(payload, path, file.url);
  }
  return payload;
}

async function doSync(opts: Options): Promise<SyncRunResult> {
  const db = opts.db ?? getLocalDb();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const origin = opts.origin;
  let sent = 0;
  let failed = 0;

  // Crash recovery: anything left "processing" by an interrupted run is retried.
  await db.ops.where("status").equals("processing").modify({ status: "pending" });

  try {
    while (true) {
      const ready = await db.ops
        .where("status")
        .equals("pending")
        .filter((o) => o.nextAttemptAt <= now())
        .sortBy("seq");
      if (ready.length === 0) break;
      // Strict FIFO: if the oldest pending op is backing off, wait for it.
      const oldest = await db.ops.where("status").equals("pending").sortBy("seq");
      if (oldest[0] && oldest[0].nextAttemptAt > now()) break;

      const batch: { op: LocalOp; payload: Record<string, unknown> }[] = [];
      let uploadFailure: unknown = null;
      for (const op of ready.slice(0, BATCH_SIZE)) {
        try {
          const payload = await uploadRefs(op, { origin, fetchImpl }, db);
          batch.push({ op, payload });
        } catch (err) {
          if (err instanceof UnauthorizedError) throw err;
          uploadFailure = err;
          await db.ops.update(op.seq!, {
            attempts: op.attempts + 1,
            nextAttemptAt: now() + backoffMs(op.attempts + 1),
            error: `Upload mislukt: ${String(err)}`,
          });
          break;
        }
      }
      if (batch.length === 0) {
        if (uploadFailure) failed++;
        break;
      }

      await db.ops.bulkUpdate(batch.map(({ op }) => ({ key: op.seq!, changes: { status: "processing" as const } })));
      let res: Response;
      try {
        res = await fetchImpl(`${origin}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ops: batch.map(({ op, payload }) => ({ id: op.id, kind: op.kind, payload })) }),
        });
      } catch (err) {
        await db.ops.bulkUpdate(
          batch.map(({ op }) => ({
            key: op.seq!,
            changes: { status: "pending" as const, attempts: op.attempts + 1, nextAttemptAt: now() + backoffMs(op.attempts + 1), error: String(err) },
          })),
        );
        return { status: "offline", sent, failed: failed + 1, pending: (await countPending(db)).total, message: "Geen verbinding" };
      }
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) {
        await db.ops.bulkUpdate(
          batch.map(({ op }) => ({
            key: op.seq!,
            changes: {
              status: "pending" as const,
              attempts: op.attempts + 1,
              nextAttemptAt: now() + backoffMs(op.attempts + 1),
              error: `Server antwoordde ${res.status}`,
            },
          })),
        );
        failed++;
        break;
      }
      const data = (await res.json()) as SyncResponse;
      const results = new Map(data.results.map((r) => [r.id, r]));
      let stop = false;
      for (const { op, payload } of batch) {
        const r = results.get(op.id);
        if (stop || !r) {
          await db.ops.update(op.seq!, { status: "pending" });
          continue;
        }
        if (r.ok) {
          sent++;
          await db.ops.update(op.seq!, { status: "done", error: null });
          if (op.kind === "capture.upsert") await db.captures.update(String(payload.id), { status: "uploaded", error: null });
        } else if (r.permanent) {
          failed++;
          await db.ops.update(op.seq!, { status: "error", error: r.error, permanent: true });
          if (op.kind === "capture.upsert") await db.captures.update(String(payload.id), { status: "error", error: r.error });
        } else {
          failed++;
          stop = true; // keep order: later ops wait for this one
          await db.ops.update(op.seq!, {
            status: "pending",
            attempts: op.attempts + 1,
            nextAttemptAt: now() + backoffMs(op.attempts + 1),
            error: r.error,
          });
        }
      }
      if (stop) break;
    }

    await flushGps(db, origin, fetchImpl);
    await refreshProcessed(db, origin, fetchImpl);
    await cleanupDone(db, now());
    await db.kv.put({ key: "lastSyncAt", value: new Date(now()).toISOString(), updatedAt: now() });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await db.ops.where("status").equals("processing").modify({ status: "pending" });
      return { status: "unauthorized", sent, failed, pending: (await countPending(db)).total, message: err.message };
    }
    await db.ops.where("status").equals("processing").modify({ status: "pending" });
    return { status: "offline", sent, failed: failed + 1, pending: (await countPending(db)).total, message: String(err) };
  }
  const pending = (await countPending(db)).total;
  return { status: failed > 0 || pending > 0 ? "partial" : "ok", sent, failed, pending };
}

/** Upload GPS track points in batches per inspection (after the inspection exists). */
async function flushGps(db: InfraSchouwDb, origin: string, fetchImpl: typeof fetch) {
  const unsynced = await db.gpsPoints.where("synced").equals(0).toArray();
  if (unsynced.length === 0) return;
  // Only inspections whose upsert op has been delivered.
  const byInspection = new Map<string, typeof unsynced>();
  for (const p of unsynced) byInspection.set(p.inspectionId, [...(byInspection.get(p.inspectionId) ?? []), p]);
  for (const [inspectionId, points] of byInspection) {
    const pendingUpsert = await db.ops
      .where("inspectionId")
      .equals(inspectionId)
      .filter((o) => o.kind === "inspection.upsert" && o.status !== "done")
      .count();
    if (pendingUpsert > 0) continue;
    for (let i = 0; i < points.length; i += 2000) {
      const chunk = points.slice(i, i + 2000);
      const res = await fetchImpl(`${origin}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ops: [
            {
              id: `gps-${inspectionId}-${chunk[0]!.t}-${chunk.length}`,
              kind: "gps.batch",
              payload: { inspectionId, points: chunk.map((p) => ({ lat: p.lat, lon: p.lon, accuracy: p.accuracy, t: p.t })) },
            },
          ],
        }),
      });
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) return;
      const data = (await res.json()) as SyncResponse;
      if (data.results[0]?.ok) await db.gpsPoints.bulkUpdate(chunk.map((p) => ({ key: p.id!, changes: { synced: 1 as const } })));
    }
  }
}

/** Mark uploaded captures whose AI analysis finished as "processed". */
async function refreshProcessed(db: InfraSchouwDb, origin: string, fetchImpl: typeof fetch) {
  const uploaded = await db.captures.where("status").equals("uploaded").limit(300).toArray();
  if (uploaded.length === 0) return;
  const res = await fetchImpl(`${origin}/api/sync/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ captureIds: uploaded.map((c) => c.id) }),
  });
  if (!res.ok) return;
  const data = (await res.json()) as { processed: string[] };
  if (data.processed.length) {
    await db.captures.bulkUpdate(data.processed.map((id) => ({ key: id, changes: { status: "processed" as const } })));
  }
}

/** Drop delivered ops after a day and uploaded file blobs once their ops are done. */
async function cleanupDone(db: InfraSchouwDb, now: number) {
  const old = await db.ops.where("status").equals("done").filter((o) => now - o.createdAt > 24 * 3600_000).toArray();
  const fileIds = old.flatMap((o) => Object.values(o.fileRefs));
  if (old.length) await db.ops.bulkDelete(old.map((o) => o.seq!));
  if (fileIds.length) await db.files.bulkDelete(fileIds);
}

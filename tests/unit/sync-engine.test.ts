import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InfraSchouwDb, setLocalDb } from "@/lib/offline/db";
import { backoffMs, runSync } from "@/lib/offline/sync-engine";
import { enqueueOp } from "@/lib/offline/outbox";

type Call = { url: string; body: unknown; method: string };

function makeServer(opts: { failFirstSync?: boolean; offline?: () => boolean } = {}) {
  const calls: Call[] = [];
  const applied = new Map<string, unknown>();
  let syncCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (opts.offline?.()) throw new TypeError("Failed to fetch");
    const method = init?.method ?? "GET";
    let body: unknown = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ url, body, method });
    if (url.endsWith("/api/upload/config")) return Response.json({ mode: "local" });
    if (url.includes("/api/upload/local")) {
      const pathname = new URL(url).searchParams.get("pathname");
      return Response.json({ url: `local:${pathname}` });
    }
    if (url.endsWith("/api/sync/status")) return Response.json({ processed: [] });
    if (url.endsWith("/api/sync")) {
      syncCalls++;
      if (opts.failFirstSync && syncCalls === 1) return new Response("boom", { status: 503 });
      const ops = (body as { ops: { id: string; kind: string; payload: unknown }[] }).ops;
      for (const op of ops) applied.set(op.id, op);
      return Response.json({ results: ops.map((o) => ({ id: o.id, ok: true })), serverTime: new Date().toISOString() });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls, applied };
}

let db: InfraSchouwDb;
beforeEach(() => {
  db = new InfraSchouwDb(`test-${Math.random()}`);
  setLocalDb(db);
});
afterEach(async () => {
  setLocalDb(null);
  await db.delete();
});

describe("sync engine", () => {
  it("uploads referenced files, substitutes URLs and delivers ops in order", async () => {
    const inspectionId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    await enqueueOp({ kind: "inspection.upsert", payload: { id: inspectionId, title: "Test" }, inspectionId }, db);
    await db.captures.put({
      id: captureId, inspectionId, type: "photo", status: "pending", fileId: "f1", thumbFileId: null, mime: "image/jpeg",
      size: 3, durationMs: null, lat: 52.5, lon: 6.1, accuracy: 5, heading: null, locationSource: "gps",
      capturedAt: new Date().toISOString(), source: "phone-camera", shotId: null, tags: [], note: null, textContent: null,
      parentCaptureId: null, meta: {}, error: null,
    });
    await enqueueOp(
      {
        kind: "capture.upsert",
        payload: { id: captureId, inspectionId, blobUrl: null },
        inspectionId,
        files: [{ path: "blobUrl", id: "f1", blob: new Blob(["abc"], { type: "image/jpeg" }), name: "a.jpg", pathname: `orgs/o/inspections/${inspectionId}/${captureId}.jpg` }],
      },
      db,
    );
    const server = makeServer();
    const result = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db });
    expect(result.status).toBe("ok");
    expect(result.sent).toBe(2);
    const syncBody = server.calls.find((c) => c.url.endsWith("/api/sync"))!.body as { ops: { kind: string; payload: { blobUrl?: string } }[] };
    expect(syncBody.ops.map((o) => o.kind)).toEqual(["inspection.upsert", "capture.upsert"]);
    expect(syncBody.ops[1]!.payload.blobUrl).toBe(`local:orgs/o/inspections/${inspectionId}/${captureId}.jpg`);
    expect((await db.captures.get(captureId))?.status).toBe("uploaded");
  });

  it("keeps ops when offline and delivers them later without duplicates", async () => {
    let offline = true;
    const server = makeServer({ offline: () => offline });
    const id = crypto.randomUUID();
    await enqueueOp({ kind: "inspection.upsert", payload: { id, title: "Offline" }, inspectionId: id }, db);
    const first = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db });
    expect(first.status).toBe("offline");
    expect(await db.ops.where("status").equals("pending").count()).toBe(1);
    offline = false;
    // Backoff: nothing is sent before nextAttemptAt.
    const early = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db });
    expect(early.sent).toBe(0);
    const later = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db, now: () => Date.now() + 10 * 60_000 });
    expect(later.sent).toBe(1);
    expect(server.applied.size).toBe(1);
  });

  it("retries after a server error", async () => {
    const server = makeServer({ failFirstSync: true });
    const id = crypto.randomUUID();
    await enqueueOp({ kind: "inspection.upsert", payload: { id, title: "Retry" }, inspectionId: id }, db);
    const first = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db });
    expect(first.sent).toBe(0);
    const second = await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db, now: () => Date.now() + 10 * 60_000 });
    expect(second.sent).toBe(1);
  });

  it("flushes GPS points once the inspection is delivered", async () => {
    const server = makeServer();
    const id = crypto.randomUUID();
    await enqueueOp({ kind: "inspection.upsert", payload: { id, title: "GPS" }, inspectionId: id }, db);
    await db.gpsPoints.bulkAdd([
      { inspectionId: id, lat: 52.5, lon: 6.1, accuracy: 4, t: 1, synced: 0 },
      { inspectionId: id, lat: 52.51, lon: 6.1, accuracy: 4, t: 2, synced: 0 },
    ]);
    await runSync({ origin: "http://app", reason: "test", fetchImpl: server.fetchImpl, db });
    expect(await db.gpsPoints.where("synced").equals(0).count()).toBe(0);
  });

  it("uses bounded exponential backoff", () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(4000);
    expect(backoffMs(20)).toBeLessThanOrEqual(5 * 60_000 + 1000);
  });
});

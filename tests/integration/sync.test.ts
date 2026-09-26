import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { captures, findingCaptures, gpsTracks, inspections } from "@/db/schema";
import { ensureStandardTemplates, getTemplatesFull } from "@/db/queries/templates";
import { applySyncOps } from "@/lib/sync/apply";
import type { SyncOp } from "@/lib/sync/ops";
import { createTestOrg, dropTestOrgs, hasDb } from "../support/db";

describe.skipIf(!hasDb)("offline sync (server)", () => {
  let a: Awaited<ReturnType<typeof createTestOrg>>;
  let b: Awaited<ReturnType<typeof createTestOrg>>;
  beforeAll(async () => {
    a = await createTestOrg("SyncA", ["schouwer", "lezer"]);
    b = await createTestOrg("SyncB", ["schouwer"]);
    await ensureStandardTemplates(a.org.id);
    await ensureStandardTemplates(b.org.id);
  });
  afterAll(async () => {
    await dropTestOrgs([a?.org.id, b?.org.id].filter(Boolean) as string[]);
    await closeDb();
  });

  it("past een volledige offline schouw idempotent toe (replay geeft geen duplicaten)", async () => {
    const tpl = (await getTemplatesFull(a.ctx.schouwer)).find((t) => t.key === "calamiteit")!;
    const inspectionId = crypto.randomUUID();
    const photoId = crypto.randomUUID();
    const t0 = Date.parse("2026-09-01T10:00:00Z");
    const ops: SyncOp[] = [
      { id: "1", kind: "inspection.upsert", payload: { id: inspectionId, templateId: tpl.id, projectId: null, stationId: null, title: "Offline schouw", startedAt: new Date(t0).toISOString(), lat: 52.5, lon: 6.1 } },
      { id: "2", kind: "gps.batch", payload: { inspectionId, points: [0, 1, 2].map((i) => ({ lat: 52.5 + i * 0.001, lon: 6.1, accuracy: 5, t: t0 + i * 60_000 })) } },
      {
        id: "3",
        kind: "capture.upsert",
        payload: {
          id: photoId, inspectionId, type: "photo", blobUrl: `local:orgs/${a.org.id}/inspections/${inspectionId}/x.jpg`, thumbUrl: null, mime: "image/jpeg", size: 10, durationMs: null,
          lat: null, lon: null, accuracy: null, heading: null, locationSource: "none", capturedAt: new Date(t0 + 30_000).toISOString(), source: "phone-camera", shotId: null, tags: [], note: null, textContent: null, parentCaptureId: null, meta: {},
        },
      },
      { id: "4", kind: "finding.upsert", payload: { id: crypto.randomUUID(), inspectionId, title: "Schade", description: "Kabel beschadigd", category: "veiligheid", priority: "hoog", lat: null, lon: null, captureIds: [photoId] } },
      { id: "5", kind: "checklist.upsert", payload: { inspectionId, itemId: tpl.checklist[0]!.id, value: "ja", note: null, skippedReason: null, captureIds: [photoId], answeredAt: new Date().toISOString() } },
      { id: "6", kind: "inspection.finish", payload: { id: inspectionId, endedAt: new Date(t0 + 600_000).toISOString(), skipped: [{ kind: "shot", refId: tpl.shots[0]!.id, reason: "Niet bereikbaar" }] } },
    ];
    const first = await applySyncOps(a.ctx.schouwer, ops);
    expect(first.every((r) => r.ok)).toBe(true);
    const replay = await applySyncOps(a.ctx.schouwer, ops);
    expect(replay.every((r) => r.ok)).toBe(true);

    const caps = await db.select().from(captures).where(eq(captures.inspectionId, inspectionId));
    expect(caps).toHaveLength(1);
    // Location derived from the GPS track (time matching), RD computed.
    expect(caps[0]!.locationSource).toBe("track-match");
    expect(caps[0]!.lat).toBeCloseTo(52.5005, 4);
    expect(caps[0]!.rdX).toBeGreaterThan(100000);
    expect(caps[0]!.seq).toBe(1);
    expect(await db.$count(findingCaptures, eq(findingCaptures.captureId, photoId))).toBe(1);
    const [insp] = await db.select().from(inspections).where(eq(inspections.id, inspectionId));
    expect(["afgerond", "verwerkt"]).toContain(insp!.status);
    const [track] = await db.select().from(gpsTracks).where(eq(gpsTracks.inspectionId, inspectionId));
    expect(track!.pointCount).toBe(3);
    expect(track!.lengthM).toBeGreaterThan(200);
  });

  it("weigert bestandsverwijzingen en id's van een andere organisatie (permanente fout)", async () => {
    const tpl = (await getTemplatesFull(b.ctx.schouwer))[0]!;
    const res = await applySyncOps(b.ctx.schouwer, [
      { id: "x", kind: "inspection.upsert", payload: { id: crypto.randomUUID(), templateId: tpl.id, projectId: null, stationId: null, title: "B", startedAt: new Date().toISOString() } },
      {
        id: "y",
        kind: "capture.upsert",
        payload: {
          id: crypto.randomUUID(), inspectionId: null, type: "photo", blobUrl: `local:orgs/${a.org.id}/inspections/steal.jpg`, thumbUrl: null, mime: null, size: null, durationMs: null,
          lat: null, lon: null, accuracy: null, heading: null, locationSource: "none", capturedAt: new Date().toISOString(), source: "phone-camera", shotId: null, tags: [], note: null, textContent: null, parentCaptureId: null, meta: {},
        },
      },
    ]);
    expect(res[0]!.ok).toBe(true);
    expect(res[1]).toMatchObject({ ok: false, permanent: true });
  });

  it("lezers kunnen niets synchroniseren", async () => {
    const res = await applySyncOps(a.ctx.lezer, [{ id: "z", kind: "capture.delete", payload: { id: crypto.randomUUID() } }]);
    expect(res[0]).toMatchObject({ ok: false, permanent: true });
  });
});

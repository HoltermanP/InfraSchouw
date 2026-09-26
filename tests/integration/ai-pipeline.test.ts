import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { aiJobs, captureAnalyses, captures, findings, gpsPoints, inspections, reports, reportVersions, transcriptSegments } from "@/db/schema";
import { ensureStandardTemplates, listTemplates } from "@/db/queries/templates";
import { enqueueInspectionProcessing } from "@/lib/ai/enqueue";
import { setOpenAI } from "@/lib/ai/client";
import { getSections, referencedCaptureIds } from "@/lib/report/doc";
import { createTestOrg, dropTestOrgs, hasDb } from "../support/db";
import { createOpenAiMock } from "../support/openai-mock";

async function makeInspection(orgId: string, userId: string) {
  const tpl = (await listTemplates({ orgId, userId, role: "admin" })).find((t) => t.key === "trace")!;
  const start = new Date("2026-09-10T08:00:00Z");
  const [insp] = await db.insert(inspections).values({ orgId, templateId: tpl.id, inspectorId: userId, title: "AI-test", status: "afgerond", startedAt: start, endedAt: new Date(start.getTime() + 600_000) }).returning();
  await db.insert(gpsPoints).values([0, 1, 2, 3].map((i) => ({ orgId, inspectionId: insp!.id, lat: 52.5 + i * 0.0005, lon: 6.1, recordedAt: new Date(start.getTime() + i * 60_000) })));
  const mk = (type: "photo" | "audio", offsetSec: number, key: string) =>
    db
      .insert(captures)
      .values({ orgId, inspectionId: insp!.id, type, blobUrl: type === "audio" ? "static:/demo/spraak-trace.wav" : `static:/demo/${key}.jpg`, mime: type === "audio" ? "audio/wav" : "image/jpeg", capturedAt: new Date(start.getTime() + offsetSec * 1000), lat: 52.5, lon: 6.1, locationSource: "gps", seq: type === "photo" ? offsetSec : null, durationMs: type === "audio" ? 20_000 : null })
      .returning();
  const [p1] = await mk("photo", 5, "trace-07-sleuf");
  const [p2] = await mk("photo", 300, "trace-02-bomen");
  const [a1] = await mk("audio", 0, "");
  return { inspectionId: insp!.id, photo1: p1!.id, photo2: p2!.id, audio: a1!.id };
}

describe.skipIf(!hasDb)("AI pipeline (OpenAI gemockt met MSW)", () => {
  const mock = createOpenAiMock();
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let noKeyOrg: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    mock.server.listen({ onUnhandledRequest: "bypass" });
    org = await createTestOrg("AI", ["admin"]);
    noKeyOrg = await createTestOrg("AI-geen-sleutel", ["admin"]);
    await ensureStandardTemplates(org.org.id);
    await ensureStandardTemplates(noKeyOrg.org.id);
  });
  afterAll(async () => {
    mock.server.close();
    delete process.env.OPENAI_API_KEY;
    setOpenAI(null);
    await dropTestOrgs([org?.org.id, noKeyOrg?.org.id].filter(Boolean) as string[]);
    await closeDb();
  });

  it("analyseert foto's, transcribeert, koppelt aan foto's en maakt een verslagvoorstel volgens schema", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    setOpenAI(null);
    const ids = await makeInspection(org.org.id, org.ctx.admin.userId!);
    await enqueueInspectionProcessing(org.ctx.admin, ids.inspectionId);

    const analyses = await db.select().from(captureAnalyses).where(eq(captureAnalyses.orgId, org.org.id));
    expect(analyses).toHaveLength(2);
    expect(analyses[0]!.result.caption).toBe("Kabelsleuf met duimstok");

    // Transcript segments are linked to the photo taken in the same time window (5 s after audio start).
    const segs = await db.select().from(transcriptSegments).where(eq(transcriptSegments.inspectionId, ids.inspectionId));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.captureIds).toContain(ids.photo1);
    expect(segs[0]!.captureIds).not.toContain(ids.photo2);

    // Extraction created an AI-proposed finding from speech.
    const fs = await db.select().from(findings).where(eq(findings.inspectionId, ids.inspectionId));
    expect(fs.some((f) => f.source === "transcript" && !f.aiAccepted)).toBe(true);

    // Report proposal: photos in the right section, unknown capture ids removed.
    const [report] = await db.select().from(reports).where(eq(reports.inspectionId, ids.inspectionId));
    expect(report?.status).toBe("concept");
    const [version] = await db.select().from(reportVersions).where(eq(reportVersions.id, report!.currentVersionId!));
    const bevindingen = getSections(version!.content).find((s) => s.attrs?.key === "bevindingen")!;
    const used = referencedCaptureIds(bevindingen);
    expect(used).toContain(ids.photo1);
    expect(used).toContain(ids.photo2);
    expect(used).not.toContain("00000000-0000-4000-8000-000000000000");
    expect(version!.meta.keyPoints[0]).toMatchObject({ title: "Kabel te ondiep", source: "ai", accepted: false });
    expect(version!.meta.openQuestions).toHaveLength(1);
    expect(getSections(version!.content).map((s) => s.attrs?.key)).toContain("samenvatting");

    const jobs = await db.select().from(aiJobs).where(eq(aiJobs.orgId, org.org.id));
    const synth = jobs.find((j) => j.type === "report_synthesis")!;
    expect(synth.status).toBe("succeeded");
    expect(synth.outputRef?.removedCaptureIds).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000000", "11111111-1111-4111-8111-111111111111"]));
    expect(synth.inputTokens).toBeGreaterThan(0);
    expect(synth.costEstimateUsd).toBeGreaterThan(0);
    expect(mock.calls.transcriptions).toBe(1);
    const [insp] = await db.select().from(inspections).where(eq(inspections.id, ids.inspectionId));
    expect(insp!.status).toBe("verwerkt");
  });

  it("werkt zonder OpenAI-sleutel: stappen overgeslagen, basisverslag gemaakt", async () => {
    delete process.env.OPENAI_API_KEY;
    setOpenAI(null);
    const ids = await makeInspection(noKeyOrg.org.id, noKeyOrg.ctx.admin.userId!);
    await enqueueInspectionProcessing(noKeyOrg.ctx.admin, ids.inspectionId);
    const jobs = await db.select().from(aiJobs).where(eq(aiJobs.orgId, noKeyOrg.org.id));
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    expect(jobs.every((j) => j.status === "skipped")).toBe(true);
    expect(jobs[0]!.error).toMatch(/OpenAI-sleutel/);
    const [report] = await db.select().from(reports).where(and(eq(reports.orgId, noKeyOrg.org.id), eq(reports.inspectionId, ids.inspectionId)));
    expect(report).toBeTruthy();
    const [version] = await db.select().from(reportVersions).where(eq(reportVersions.id, report!.currentVersionId!));
    expect(version!.authorId).toBeNull();
    expect(version!.note).toMatch(/zonder AI/);
  });
});

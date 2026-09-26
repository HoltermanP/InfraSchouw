import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { aiJobs, captures, type AiJobInput, type Capture } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import type { AiJobType } from "@/lib/domain";
import { dispatchJob } from "./dispatch";

/**
 * Create a job row (idempotent on the key) and dispatch it. Returns the job id
 * (existing or new).
 */
export async function enqueueJob(ctx: OrgCtx, type: AiJobType, input: AiJobInput, idempotencyKey: string, opts: { dispatch?: boolean } = {}) {
  const [created] = await db
    .insert(aiJobs)
    .values({ orgId: ctx.orgId, type, inputRef: input, idempotencyKey, createdBy: ctx.userId })
    .onConflictDoNothing({ target: aiJobs.idempotencyKey })
    .returning({ id: aiJobs.id });
  if (created) {
    if (opts.dispatch !== false) await dispatchJob(created.id);
    return created.id;
  }
  const [existing] = await db.select({ id: aiJobs.id }).from(aiJobs).where(eq(aiJobs.idempotencyKey, idempotencyKey)).limit(1);
  return existing!.id;
}

/** Per-capture processing right after upload (vision / transcription). */
export async function enqueueCaptureProcessing(ctx: OrgCtx, capture: Pick<Capture, "id" | "type" | "inspectionId" | "blobUrl">) {
  if (!capture.blobUrl) return null;
  if (capture.type === "photo" || capture.type === "sketch" || capture.type === "video") {
    return enqueueJob(ctx, "capture_analysis", { captureId: capture.id, inspectionId: capture.inspectionId ?? undefined }, `capture_analysis:${capture.id}:1`);
  }
  if (capture.type === "audio") {
    return enqueueJob(ctx, "transcription", { captureId: capture.id, inspectionId: capture.inspectionId ?? undefined }, `transcription:${capture.id}:1`);
  }
  return null;
}

/**
 * After an inspection is finished: make sure every capture has been
 * processed, then run the report synthesis (which waits for pending
 * capture jobs itself).
 */
export async function enqueueInspectionProcessing(ctx: OrgCtx, inspectionId: string) {
  const rows = await db
    .select({ id: captures.id, type: captures.type, inspectionId: captures.inspectionId, blobUrl: captures.blobUrl })
    .from(captures)
    .where(and(eq(captures.orgId, ctx.orgId), eq(captures.inspectionId, inspectionId), inArray(captures.type, ["photo", "sketch", "video", "audio"])));
  for (const c of rows) await enqueueCaptureProcessing(ctx, c);
  return enqueueJob(ctx, "report_synthesis", { inspectionId }, `report_synthesis:${inspectionId}:${Date.now()}`);
}

export async function enqueueReportSynthesis(ctx: OrgCtx, inspectionId: string, opts: { force?: boolean } = {}) {
  return enqueueJob(ctx, "report_synthesis", { inspectionId, force: opts.force }, `report_synthesis:${inspectionId}:${Date.now()}`);
}

export async function enqueueSectionRegeneration(ctx: OrgCtx, reportId: string, sectionKey: string, instruction?: string, force?: boolean) {
  return enqueueJob(ctx, "section_regeneration", { reportId, sectionKey, instruction, force }, `section:${reportId}:${sectionKey}:${Date.now()}`);
}

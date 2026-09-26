import "server-only";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiJobs, organizations, type AiJob } from "@/db/schema";
import { resolveOrgSettings } from "@/lib/org-settings";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getOpenAI } from "./client";
import { estimateCost } from "./cost";
import type { JobContext, JobOutcome } from "./processors/types";

const MAX_ATTEMPTS = 3;

export class SkipJob extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipJob";
  }
}

/** Waits for a job that other jobs depend on (report synthesis waits for capture jobs). */
export class DeferJob extends Error {
  constructor(message: string, readonly delaySeconds = 20) {
    super(message);
    this.name = "DeferJob";
  }
}

async function loadProcessor(type: AiJob["type"]) {
  switch (type) {
    case "capture_analysis":
      return (await import("./processors/capture-analysis")).processCaptureAnalysis;
    case "transcription":
      return (await import("./processors/transcription")).processTranscription;
    case "report_synthesis":
      return (await import("./processors/report-synthesis")).processReportSynthesis;
    case "section_regeneration":
      return (await import("./processors/section-regeneration")).processSectionRegeneration;
  }
}

function aiStepEnabled(type: AiJob["type"], settings: ReturnType<typeof resolveOrgSettings>) {
  if (type === "capture_analysis") return settings.ai.captureAnalysis;
  if (type === "transcription") return settings.ai.transcription;
  return settings.ai.reportSynthesis;
}

/**
 * Execute a job. Idempotent: finished jobs are not re-run. Errors below the
 * attempt limit are re-thrown so QStash retries; the last failure is stored.
 */
export async function runJob(jobId: string): Promise<AiJob | null> {
  const [claimed] = await db
    .update(aiJobs)
    .set({ status: "running", attempts: sql`${aiJobs.attempts} + 1`, startedAt: new Date(), error: null })
    .where(
      and(
        eq(aiJobs.id, jobId),
        or(
          inArray(aiJobs.status, ["queued", "failed"]),
          // A job left "running" by a crashed/timed-out worker is picked up again.
          and(eq(aiJobs.status, "running"), lt(aiJobs.startedAt, new Date(Date.now() - 15 * 60_000))),
        ),
      ),
    )
    .returning();
  if (!claimed) {
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, jobId)).limit(1);
    return job ?? null;
  }
  const job = claimed;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, job.orgId)).limit(1);
  const settings = resolveOrgSettings(org?.settings);
  const openai = getOpenAI();
  const ctx: JobContext = {
    job,
    org: { id: job.orgId, settings },
    orgCtx: { orgId: job.orgId, userId: job.createdBy, role: "admin" },
    openai,
    aiEnabled: Boolean(openai) && aiStepEnabled(job.type, settings),
  };

  try {
    if (ctx.aiEnabled) await checkRateLimit("ai", job.orgId);
    const processor = await loadProcessor(job.type);
    const outcome: JobOutcome = await processor(ctx);
    const status = outcome.skipped ? "skipped" : "succeeded";
    const [done] = await db
      .update(aiJobs)
      .set({
        status,
        outputRef: outcome.output ?? null,
        model: outcome.model ?? null,
        inputTokens: outcome.inputTokens ?? 0,
        outputTokens: outcome.outputTokens ?? 0,
        costEstimateUsd: outcome.model ? estimateCost(outcome.model, outcome.inputTokens ?? 0, outcome.outputTokens ?? 0, outcome.audioSeconds ?? 0) : 0,
        error: outcome.skipped ? outcome.message ?? null : null,
        finishedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId))
      .returning();
    return done ?? null;
  } catch (err) {
    if (err instanceof DeferJob) {
      // Give dependencies time to finish; does not count as an attempt.
      await db.update(aiJobs).set({ status: "queued", attempts: sql`greatest(${aiJobs.attempts} - 1, 0)`, error: err.message }).where(eq(aiJobs.id, jobId));
      if (job.attempts <= 40) {
        const { dispatchJob } = await import("./dispatch");
        await dispatchJob(jobId, err.delaySeconds);
      }
      return null;
    }
    if (err instanceof SkipJob) {
      const [done] = await db
        .update(aiJobs)
        .set({ status: "skipped", error: err.message, finishedAt: new Date() })
        .where(eq(aiJobs.id, jobId))
        .returning();
      return done ?? null;
    }
    const message = err instanceof RateLimitError ? "Rate limit AI bereikt — wordt later opnieuw geprobeerd." : err instanceof Error ? err.message : String(err);
    const final = job.attempts >= MAX_ATTEMPTS;
    await db
      .update(aiJobs)
      .set({ status: final ? "failed" : "queued", error: message.slice(0, 2000), finishedAt: final ? new Date() : null })
      .where(eq(aiJobs.id, jobId));
    console.error(`[ai] job ${job.type} ${jobId} attempt ${job.attempts} failed:`, message);
    if (!final) throw err;
    return null;
  }
}

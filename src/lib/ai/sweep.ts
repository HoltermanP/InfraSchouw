import "server-only";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { aiJobs } from "@/db/schema";
import { runJob } from "./runner";

/**
 * Safety net for jobs that were never picked up (e.g. a lost after() callback
 * or a QStash outage): runs queued jobs and reclaims stale running ones.
 */
export async function processQueuedJobs(opts: { orgId?: string; limit?: number; olderThanMs?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? 30_000));
  const jobs = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        opts.orgId ? eq(aiJobs.orgId, opts.orgId) : undefined,
        or(and(eq(aiJobs.status, "queued"), lt(aiJobs.updatedAt, cutoff)), and(inArray(aiJobs.status, ["running"]), lt(aiJobs.startedAt, new Date(Date.now() - 15 * 60_000)))),
      ),
    )
    .orderBy(asc(aiJobs.createdAt))
    .limit(opts.limit ?? 20);
  let done = 0;
  let failed = 0;
  for (const j of jobs) {
    try {
      await runJob(j.id);
      done++;
    } catch {
      failed++;
    }
  }
  return { processed: done, failed, found: jobs.length };
}

import "server-only";
import { Client } from "@upstash/qstash";
import { after } from "next/server";
import { env } from "@/lib/env";

/**
 * Run a job asynchronously: via QStash (durable, retried, signed callback to
 * /api/jobs/run) when configured, otherwise with Next.js `after()` so it runs
 * after the response has been sent. Outside a request (scripts/tests) the job
 * runs inline.
 */
export async function dispatchJob(jobId: string, delaySeconds = 0) {
  if (env.qstash.enabled) {
    const client = new Client({ token: env.qstash.token! });
    await client.publishJSON({
      url: `${env.appUrl}/api/jobs/run`,
      body: { jobId },
      retries: 3,
      delay: delaySeconds || undefined,
      deduplicationId: delaySeconds ? undefined : `job-${jobId}`,
    });
    return "qstash" as const;
  }
  const { runJob } = await import("./runner");
  try {
    after(async () => {
      if (delaySeconds) await new Promise((r) => setTimeout(r, delaySeconds * 1000));
      await runJob(jobId).catch((err) => console.error("[ai] job failed", jobId, err));
    });
    return "after" as const;
  } catch {
    // Not inside a request scope: run now.
    await runJob(jobId).catch((err) => console.error("[ai] job failed", jobId, err));
    return "inline" as const;
  }
}

import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/api";
import { runJob } from "@/lib/ai/runner";

export const maxDuration = 800;

/** QStash callback: runs one AI job. Only accepts requests with a valid QStash signature. */
export async function POST(req: Request) {
  if (!env.qstash.enabled) return jsonError(404, "QStash is niet geconfigureerd.");
  const signature = req.headers.get("upstash-signature");
  const body = await req.text();
  if (!signature) return jsonError(401, "Handtekening ontbreekt.");
  const receiver = new Receiver({ currentSigningKey: env.qstash.currentSigningKey!, nextSigningKey: env.qstash.nextSigningKey! });
  const valid = await receiver.verify({ signature, body, url: `${env.appUrl}/api/jobs/run` }).catch(() => false);
  if (!valid) return jsonError(401, "Ongeldige handtekening.");
  const parsed = z.object({ jobId: z.string().uuid() }).safeParse(JSON.parse(body));
  if (!parsed.success) return jsonError(400, "Ongeldige payload.");
  try {
    const job = await runJob(parsed.data.jobId);
    return NextResponse.json({ ok: true, status: job?.status ?? "deferred" });
  } catch (err) {
    // A 5xx makes QStash retry with backoff.
    return jsonError(500, err instanceof Error ? err.message : "Job mislukt");
  }
}

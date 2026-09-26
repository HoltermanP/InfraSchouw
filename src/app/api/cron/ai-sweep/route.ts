import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { jsonError } from "@/lib/api";
import { processQueuedJobs } from "@/lib/ai/sweep";

export const maxDuration = 800;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return jsonError(401, "Niet geautoriseerd.");
  return NextResponse.json(await processQueuedJobs({ limit: 25, olderThanMs: 2 * 60_000 }));
}

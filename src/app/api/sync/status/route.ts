import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { aiJobs } from "@/db/schema";
import { withSession } from "@/lib/api";

const bodySchema = z.object({ captureIds: z.array(z.string().uuid()).max(500) });

/** Which captures have finished server-side processing (AI done or skipped). */
export const POST = withSession(async (req, session) => {
  const { captureIds } = bodySchema.parse(await req.json());
  if (captureIds.length === 0) return NextResponse.json({ processed: [] });
  const jobs = await db
    .select({ input: aiJobs.inputRef, status: aiJobs.status })
    .from(aiJobs)
    .where(and(eq(aiJobs.orgId, session.org.id), inArray(aiJobs.type, ["capture_analysis", "transcription"])));
  const done = new Set<string>();
  const pending = new Set<string>();
  for (const j of jobs) {
    const id = j.input.captureId;
    if (!id || !captureIds.includes(id)) continue;
    if (j.status === "queued" || j.status === "running") pending.add(id);
    else done.add(id);
  }
  return NextResponse.json({ processed: [...done].filter((id) => !pending.has(id)) });
});

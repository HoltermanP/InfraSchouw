import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiJobs, reports } from "@/db/schema";
import { withSession, jsonError } from "@/lib/api";

/** Lightweight polling endpoint for the editor (new version / job state). */
export const GET = withSession<RouteContext<"/api/reports/[id]/state">>(async (_req, session, ctx) => {
  const { id } = await ctx.params;
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, session.org.id), eq(reports.id, id))).limit(1);
  if (!report) return jsonError(404, "Niet gevonden.");
  const pendingJobs = await db.$count(
    aiJobs,
    and(eq(aiJobs.orgId, session.org.id), inArray(aiJobs.status, ["queued", "running"]), sql`${aiJobs.inputRef}->>'reportId' = ${id}`),
  );
  const [lastJob] = await db
    .select({ status: aiJobs.status, error: aiJobs.error })
    .from(aiJobs)
    .where(and(eq(aiJobs.orgId, session.org.id), sql`${aiJobs.inputRef}->>'reportId' = ${id}`))
    .orderBy(desc(aiJobs.createdAt))
    .limit(1);
  return NextResponse.json({ currentVersionId: report.currentVersionId, status: report.status, pendingJobs, lastJob: lastJob ?? null });
});

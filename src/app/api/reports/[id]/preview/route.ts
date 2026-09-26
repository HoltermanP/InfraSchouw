import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { withSession, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { reportPdfFor } from "@/lib/export/report-pdf";
import type { ReportMeta, TiptapDoc } from "@/lib/report/types";

export const maxDuration = 120;

const bodySchema = z.object({ content: z.object({ type: z.literal("doc"), content: z.array(z.unknown()) }).passthrough(), meta: z.record(z.string(), z.unknown()) });

/** Live PDF preview of unsaved editor content. */
export const POST = withSession<RouteContext<"/api/reports/[id]/preview">>(async (req, session, ctx) => {
  const { id } = await ctx.params;
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, session.org.id), eq(reports.id, id))).limit(1);
  if (!report) return jsonError(404, "Niet gevonden.");
  await checkRateLimit("export", session.org.id);
  const body = bodySchema.parse(await req.json());
  const res = await reportPdfFor(session.org.id, report.inspectionId, {
    override: { content: body.content as unknown as TiptapDoc, meta: body.meta as unknown as ReportMeta },
  });
  if (!res) return jsonError(404, "Niet gevonden.");
  return new Response(new Uint8Array(res.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=voorbeeld.pdf", "Cache-Control": "no-store" } });
});

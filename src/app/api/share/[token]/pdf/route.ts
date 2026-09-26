import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportExports } from "@/db/schema";
import { jsonError, withErrors } from "@/lib/api";
import { resolveShareToken } from "@/lib/share";
import { checkRateLimit } from "@/lib/rate-limit";
import { serveObject } from "@/lib/media-response";

/** Archived final PDF of a shared report (served through the app, never a public blob URL). */
export const GET = withErrors<RouteContext<"/api/share/[token]/pdf">>(async (req, ctx) => {
  const { token } = await ctx.params;
  const share = await resolveShareToken(token);
  if (!share) return jsonError(404, "Deellink is ongeldig, verlopen of ingetrokken.");
  await checkRateLimit("share", share.link.id);
  const [exp] = share.report.finalExportId
    ? await db.select().from(reportExports).where(eq(reportExports.id, share.report.finalExportId))
    : await db.select().from(reportExports).where(and(eq(reportExports.reportId, share.report.id), eq(reportExports.archived, true))).orderBy(desc(reportExports.createdAt)).limit(1);
  if (!exp) return jsonError(404, "Geen gearchiveerde PDF.");
  return serveObject(exp.blobUrl, req, { downloadName: `${share.report.title.replace(/[^\p{L}\p{N} _-]+/gu, "").slice(0, 80)}.pdf` });
});

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { withSession, jsonError } from "@/lib/api";
import { loadInspectionContext } from "@/lib/report/context";
import { renderStaticMap } from "@/lib/export/static-map";

export const maxDuration = 60;

/** Server-rendered overview map (PDOK tiles + markers) for the editor and exports. */
export const GET = withSession<RouteContext<"/api/reports/[id]/static-map">>(async (_req, session, ctx) => {
  const { id } = await ctx.params;
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, session.org.id), eq(reports.id, id))).limit(1);
  if (!report) return jsonError(404, "Niet gevonden.");
  const ictx = await loadInspectionContext(session.org.id, report.inspectionId);
  if (!ictx) return jsonError(404, "Niet gevonden.");
  const photos = ictx.captures.filter((c) => c.lat !== null && ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport);
  const png = await renderStaticMap({
    width: 1200,
    height: 750,
    photos: photos.map((c) => ({ lat: c.lat!, lon: c.lon!, nr: c.seq })),
    findings: ictx.findings.filter((f) => f.lat !== null).map((f, i) => ({ lat: f.lat!, lon: f.lon!, priority: f.priority, nr: i + 1 })),
    track: ictx.track?.lineGeojson ?? null,
    extraPoints: ictx.inspection.lat !== null ? [{ lat: ictx.inspection.lat, lon: ictx.inspection.lon! }] : [],
  });
  if (!png) return jsonError(404, "Geen locaties om te tonen.");
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
});

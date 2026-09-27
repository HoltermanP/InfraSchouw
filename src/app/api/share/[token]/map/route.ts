import { jsonError, withErrors } from "@/lib/api";
import { resolveShareToken } from "@/lib/share";
import { loadInspectionContext } from "@/lib/report/context";
import { overviewMapInput, renderStaticMap } from "@/lib/export/static-map";
import { serveObject } from "@/lib/media-response";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

export const GET = withErrors<RouteContext<"/api/share/[token]/map">>(async (req, ctx) => {
  const { token } = await ctx.params;
  const share = await resolveShareToken(token);
  if (!share) return jsonError(404, "Deellink is ongeldig, verlopen of ingetrokken.");
  await checkRateLimit("share", share.link.id);
  if (share.report.mapSnapshotUrl) return serveObject(share.report.mapSnapshotUrl, req);
  const ictx = await loadInspectionContext(share.report.orgId, share.report.inspectionId);
  if (!ictx) return jsonError(404, "Niet gevonden.");
  const png = await renderStaticMap({ width: 1200, height: 750, ...overviewMapInput(ictx) });
  if (!png) return jsonError(404, "Geen kaart.");
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" } });
});

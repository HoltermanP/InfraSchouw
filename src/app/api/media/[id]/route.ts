import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { captureAnnotations, captures, reports } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { jsonError, toErrorResponse } from "@/lib/api";
import { serveObject } from "@/lib/media-response";
import { resolveShareToken } from "@/lib/share";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Authorised media proxy for a capture.
 *   ?v=orig (default) | thumb | annotated | kf<N> (video keyframe)
 *   ?s=<share token>  → access through a public share link (only captures of that report's inspection)
 *   ?download=1       → Content-Disposition attachment
 */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Niet gevonden.");
    const url = new URL(req.url);
    const variant = url.searchParams.get("v") ?? "orig";
    const shareToken = url.searchParams.get("s");

    const [capture] = await db.select().from(captures).where(eq(captures.id, id)).limit(1);
    if (!capture) return jsonError(404, "Niet gevonden.");

    if (shareToken) {
      const share = await resolveShareToken(shareToken);
      if (!share) return jsonError(403, "Deellink is ongeldig, verlopen of ingetrokken.");
      await checkRateLimit("share", share.link.id);
      if (!capture.inspectionId || capture.inspectionId !== share.report.inspectionId || capture.hiddenInReport) return jsonError(403, "Geen toegang.");
      const [report] = await db.select().from(reports).where(and(eq(reports.id, share.report.id), eq(reports.inspectionId, capture.inspectionId ?? ""))).limit(1);
      if (!report || capture.hiddenInReport) return jsonError(403, "Geen toegang.");
    } else {
      const session = await getSession();
      if (session.status !== "ok") return jsonError(401, "Niet ingelogd.");
      if (capture.orgId !== session.org.id) return jsonError(404, "Niet gevonden.");
    }

    let target: string | null = null;
    if (variant === "thumb") target = capture.thumbUrl ?? capture.blobUrl;
    else if (variant === "annotated") {
      const [ann] = await db
        .select()
        .from(captureAnnotations)
        .where(eq(captureAnnotations.captureId, capture.id))
        .orderBy(desc(captureAnnotations.createdAt))
        .limit(1);
      target = ann?.renderedUrl ?? capture.blobUrl;
    } else if (variant.startsWith("kf")) {
      const idx = Number(variant.slice(2));
      target = capture.meta.keyframes?.[idx]?.url ?? null;
    } else target = capture.blobUrl;
    if (!target) return jsonError(404, "Geen bestand bij deze capture.");
    const name = url.searchParams.get("download") ? `capture-${capture.seq ?? capture.id.slice(0, 8)}` : undefined;
    return serveObject(target, req, { downloadName: name, cacheSeconds: variant === "thumb" ? 86400 : 3600 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

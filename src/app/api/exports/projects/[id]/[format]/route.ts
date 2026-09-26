import { withSession, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { renderBillingPdf, renderBillingXlsx } from "@/lib/export/billing";
import { audit } from "@/db/queries/audit";

export const maxDuration = 300;

export const GET = withSession<RouteContext<"/api/exports/projects/[id]/[format]">>(async (_req, session, ctx) => {
  const { id, format } = await ctx.params;
  await checkRateLimit("export", session.org.id);
  const res = format === "billing-xlsx" ? await renderBillingXlsx(session.ctx, id) : format === "billing-pdf" ? await renderBillingPdf(session.ctx, id) : null;
  if (!res) return jsonError(404, "Niet gevonden.");
  await audit(session.ctx, `export_${format}`, "project", id, `Export ${format}`);
  const type = format === "billing-xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  return new Response(new Uint8Array(res.buffer), {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(res.name)}`, "Cache-Control": "private, no-store" },
  });
});

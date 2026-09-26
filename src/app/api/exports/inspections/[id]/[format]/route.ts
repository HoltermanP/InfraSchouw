import { withSession, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadInspectionContext } from "@/lib/report/context";
import { reportPdfFor } from "@/lib/export/report-pdf";
import { buildReportModel } from "@/lib/export/model";
import { renderReportDocx } from "@/lib/export/docx";
import { renderInspectionXlsx } from "@/lib/export/xlsx";
import { renderInspectionZip } from "@/lib/export/zip";
import { inspectionGeoJson } from "@/lib/export/geojson";
import { buildBaselineReport } from "@/lib/report/build";
import { audit } from "@/db/queries/audit";

export const maxDuration = 300;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  geojson: "application/geo+json",
};

function fileBase(title: string) {
  return title.replace(/[^\p{L}\p{N} _.-]+/gu, "").slice(0, 80).trim() || "schouw";
}

function download(body: Buffer | string, type: string, name: string, inline = false) {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withSession<RouteContext<"/api/exports/inspections/[id]/[format]">>(async (req, session, ctx) => {
  const { id, format } = await ctx.params;
  if (!TYPES[format]) return jsonError(404, "Onbekend exportformaat.");
  await checkRateLimit("export", session.org.id);
  const url = new URL(req.url);
  const versionId = url.searchParams.get("version");
  const inline = url.searchParams.get("inline") === "1";

  if (format === "pdf") {
    const res = await reportPdfFor(session.org.id, id, { versionId });
    if (!res) return jsonError(404, "Niet gevonden.");
    await audit(session.ctx, "export_pdf", "inspection", id, "PDF-verslag geëxporteerd");
    return download(res.pdf, TYPES.pdf!, res.fileName, inline);
  }
  const ictx = await loadInspectionContext(session.org.id, id);
  if (!ictx) return jsonError(404, "Niet gevonden.");
  const base = fileBase(ictx.inspection.title);
  await audit(session.ctx, `export_${format}`, "inspection", id, `Export ${format.toUpperCase()}`);
  switch (format) {
    case "docx": {
      const { content, meta } = ictx.currentVersion ?? buildBaselineReport(ictx);
      const model = await buildReportModel(ictx, content, meta, {
        versionNumber: ictx.currentVersion?.versionNumber ?? null,
        status: ictx.report?.status ?? "concept",
        mapSnapshotUrl: ictx.report?.mapSnapshotUrl,
      });
      return download(await renderReportDocx(model), TYPES.docx!, `${base}.docx`);
    }
    case "xlsx":
      return download(await renderInspectionXlsx(ictx), TYPES.xlsx!, `${base}.xlsx`);
    case "geojson":
      return download(JSON.stringify(inspectionGeoJson(ictx), null, 2), TYPES.geojson!, `${base}.geojson`);
    case "zip": {
      const pdf = ictx.report ? await reportPdfFor(session.org.id, id) : null;
      return download(await renderInspectionZip(ictx, pdf ? { buffer: pdf.pdf, name: pdf.fileName } : null), TYPES.zip!, `${base}.zip`);
    }
  }
  return jsonError(404, "Onbekend exportformaat.");
});

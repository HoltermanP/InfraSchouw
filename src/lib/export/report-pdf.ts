import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportVersions } from "@/db/schema";
import { loadInspectionContext } from "@/lib/report/context";
import { buildBaselineReport } from "@/lib/report/build";
import type { ReportMeta, TiptapDoc } from "@/lib/report/types";
import type { ReportStatus } from "@/lib/domain";
import { buildReportModel } from "./model";
import { renderReportPdf } from "./pdf";

/**
 * Render the report of an inspection as PDF: a specific version, the
 * current version, or explicit (unsaved) content for the live preview.
 */
export async function reportPdfFor(
  orgId: string,
  inspectionId: string,
  opts: { versionId?: string | null; override?: { content: TiptapDoc; meta: ReportMeta } } = {},
) {
  const ctx = await loadInspectionContext(orgId, inspectionId);
  if (!ctx) return null;
  let content: TiptapDoc;
  let meta: ReportMeta;
  let versionNumber: number | null = null;
  let status: ReportStatus = ctx.report?.status ?? "concept";
  if (opts.override) {
    ({ content, meta } = opts.override);
    versionNumber = ctx.currentVersion?.versionNumber ?? null;
  } else if (opts.versionId) {
    const [v] = await db.select().from(reportVersions).where(eq(reportVersions.id, opts.versionId)).limit(1);
    if (!v || v.orgId !== orgId) return null;
    ({ content, meta } = v);
    versionNumber = v.versionNumber;
    status = v.status;
  } else if (ctx.currentVersion) {
    ({ content, meta } = ctx.currentVersion);
    versionNumber = ctx.currentVersion.versionNumber;
  } else {
    ({ content, meta } = buildBaselineReport(ctx));
  }
  const model = await buildReportModel(ctx, content, meta, { versionNumber, status, mapSnapshotUrl: ctx.report?.mapSnapshotUrl });
  const pdf = await renderReportPdf(model);
  const safeTitle = model.title.replace(/[^\p{L}\p{N} _.-]+/gu, "").slice(0, 80).trim() || "schouwverslag";
  return { pdf, fileName: `${safeTitle}${versionNumber ? ` v${versionNumber}` : ""}.pdf`, model, ctx };
}

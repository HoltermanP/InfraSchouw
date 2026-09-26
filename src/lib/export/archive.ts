import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportExports, reports } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import { putObject } from "@/lib/storage";
import { reportPdfFor } from "./report-pdf";

export function sha256(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Render, hash and archive the PDF of the final report version. */
export async function archiveFinalPdf(ctx: OrgCtx, reportId: string, versionId: string) {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) throw new Error("Verslag niet gevonden.");
  const res = await reportPdfFor(ctx.orgId, report.inspectionId, { versionId });
  if (!res) throw new Error("PDF kon niet worden gemaakt.");
  const hash = sha256(res.pdf);
  const stored = await putObject(`orgs/${ctx.orgId}/reports/${reportId}/definitief-${versionId}.pdf`, res.pdf, "application/pdf");
  const [row] = await db
    .insert(reportExports)
    .values({ orgId: ctx.orgId, reportId, versionId, type: "pdf", blobUrl: stored.url, sha256: hash, size: res.pdf.byteLength, archived: true, createdBy: ctx.userId })
    .returning();
  return row!;
}

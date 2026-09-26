import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { FileDown, ShieldCheck } from "lucide-react";
import { db } from "@/db/client";
import { reportVersions } from "@/db/schema";
import { ReportHtml } from "@/components/report-view/report-html";
import { resolveShareToken } from "@/lib/share";
import { loadInspectionContext } from "@/lib/report/context";
import { buildReportModel } from "@/lib/export/model";
import { captureUrl } from "@/lib/media-url";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Gedeeld schouwverslag", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Public, read-only view of a final report via a share link. */
export default async function SharedReportPage(props: PageProps<"/delen/[token]">) {
  const { token } = await props.params;
  const share = await resolveShareToken(token, { touch: true });
  if (!share) notFound();
  const ctx = await loadInspectionContext(share.report.orgId, share.report.inspectionId);
  if (!ctx || !share.report.currentVersionId) notFound();
  const [version] = await db.select().from(reportVersions).where(eq(reportVersions.id, share.report.currentVersionId));
  if (!version) notFound();
  const model = await buildReportModel(ctx, version.content, version.meta, { versionNumber: version.versionNumber, status: version.status, loadImages: false });
  return (
    <main className="flex-1 bg-background px-4 py-8">
      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-600" /> Alleen-lezen deellink · geldig tot {fmtDate(share.link.expiresAt)}
        </span>
        <a href={`/api/share/${token}/pdf`} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground" data-testid="shared-pdf">
          <FileDown className="size-4" /> Download PDF
        </a>
      </div>
      <ReportHtml model={model} photoSrc={(id) => captureUrl(id, "orig", token)} mapSrc={`/api/share/${token}/map`} />
    </main>
  );
}

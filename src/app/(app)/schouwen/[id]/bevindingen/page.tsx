import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { FindingsTable } from "@/components/inspections/findings-table";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext, reportPhotos } from "@/lib/report/context";
import { captureUrl } from "@/lib/media-url";

export const metadata = { title: "Schouw — bevindingen" };

export default async function FindingsPage(props: PageProps<"/schouwen/[id]/bevindingen">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  return (
    <PageBody>
      <FindingsTable
        inspectionId={id}
        canEdit={roleAtLeast(session.role, "schouwer")}
        photos={reportPhotos(ctx).map((c) => ({ id: c.id, seq: c.seq, thumb: c.thumbUrl || c.blobUrl ? captureUrl(c.id, "thumb") : null }))}
        findings={ctx.findings.map((f) => ({
          id: f.id,
          seq: f.seq,
          title: f.title,
          description: f.description,
          category: f.category,
          priority: f.priority,
          status: f.status,
          recommendation: f.recommendation,
          source: f.source,
          aiAccepted: f.aiAccepted,
          captureIds: f.captureIds,
          lat: f.lat,
          lon: f.lon,
        }))}
      />
    </PageBody>
  );
}

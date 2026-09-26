import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { AddEvidenceButton, EvidenceTable } from "@/components/billing/evidence-table";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext, reportPhotos } from "@/lib/report/context";
import { captureUrl } from "@/lib/media-url";

export const metadata = { title: "Schouw — afrekening" };

export default async function InspectionBillingPage(props: PageProps<"/schouwen/[id]/afrekening">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  if (!ctx.project) {
    return (
      <PageBody>
        <p className="text-muted-foreground">Koppel de schouw eerst aan een project met afrekenposten.</p>
      </PageBody>
    );
  }
  const items = new Map(ctx.billingItems.map((b) => [b.id, b]));
  const seq = new Map(ctx.captures.map((c) => [c.id, c.seq]));
  const canEdit = roleAtLeast(session.role, "schouwer");
  return (
    <PageBody>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Aangetroffen hoeveelheden bij deze schouw, per afrekenpost van project {ctx.project.number}.</p>
        {canEdit ? (
          <AddEvidenceButton
            inspectionId={id}
            items={ctx.billingItems.map((b) => ({ id: b.id, code: b.code, description: b.description, unit: b.unit }))}
            photos={reportPhotos(ctx).map((c) => ({ id: c.id, seq: c.seq, thumb: captureUrl(c.id, "thumb") }))}
          />
        ) : null}
      </div>
      <EvidenceTable
        canConfirm={roleAtLeast(session.role, "projectleider")}
        canEdit={canEdit}
        rows={ctx.billingEvidence.map((e) => {
          const item = items.get(e.billingItemId)!;
          return {
            id: e.id,
            itemCode: item.code,
            itemDescription: item.description,
            unit: item.unit,
            unitPrice: item.unitPrice,
            quantity: e.quantity,
            status: e.status,
            source: e.source,
            confidence: e.confidence,
            remark: e.remark,
            photos: e.captureIds.map((cid) => ({ id: cid, seq: seq.get(cid) ?? null, thumb: captureUrl(cid, "thumb") })),
            inspectionId: id,
          };
        })}
      />
    </PageBody>
  );
}

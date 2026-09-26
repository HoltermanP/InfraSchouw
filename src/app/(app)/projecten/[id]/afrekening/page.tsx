import { PageBody } from "@/components/layout/page-header";
import { BillingItemsTable } from "@/components/billing/billing-items-table";
import { EvidenceTable } from "@/components/billing/evidence-table";
import { projectBilling } from "@/db/queries/billing";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Project — afrekenposten" };

export default async function ProjectBillingPage(props: PageProps<"/projecten/[id]/afrekening">) {
  const { id } = await props.params;
  const session = await requireSession();
  const billing = await projectBilling(session.ctx, id);
  return (
    <PageBody>
      <BillingItemsTable projectId={id} rows={billing.overview.rows} totals={billing.overview.totals} canEdit={roleAtLeast(session.role, "projectleider")} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Bewijs uit schouwen</h2>
        <p className="text-sm text-muted-foreground">Voorgestelde hoeveelheden (door AI of schouwer) tellen pas mee als ‘aangetoond’ nadat een projectleider ze bevestigt.</p>
        <EvidenceTable
          showInspection
          canConfirm={roleAtLeast(session.role, "projectleider")}
          canEdit={roleAtLeast(session.role, "schouwer")}
          rows={billing.evidence.map((r) => ({
            id: r.e.id,
            itemCode: r.item.code,
            itemDescription: r.item.description,
            unit: r.item.unit,
            unitPrice: r.item.unitPrice,
            quantity: r.e.quantity,
            status: r.e.status,
            source: r.e.source,
            confidence: r.e.confidence,
            remark: r.e.remark,
            photos: r.photos.map((p) => ({ id: p.id, seq: p.seq, thumb: p.thumb })),
            inspectionId: r.inspection.id,
            inspectionTitle: r.inspection.title,
            inspectionDate: r.inspection.startedAt.toISOString(),
          }))}
        />
      </section>
    </PageBody>
  );
}

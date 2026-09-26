import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { ActionsTable } from "@/components/inspections/actions-table";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext } from "@/lib/report/context";

export const metadata = { title: "Schouw — acties" };

export default async function ActionsPage(props: PageProps<"/schouwen/[id]/acties">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  return (
    <PageBody>
      <ActionsTable
        inspectionId={id}
        canEdit={roleAtLeast(session.role, "schouwer")}
        findings={ctx.findings.map((f) => ({ id: f.id, title: f.title }))}
        rows={ctx.actions.map((a) => ({ id: a.id, description: a.description, owner: a.owner, dueDate: a.dueDate, status: a.status, findingIds: a.findingIds, aiAccepted: a.aiAccepted, inspectionId: a.inspectionId }))}
      />
    </PageBody>
  );
}

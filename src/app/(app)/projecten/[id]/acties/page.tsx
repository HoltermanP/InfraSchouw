import { and, asc, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { ActionsTable } from "@/components/inspections/actions-table";
import { db } from "@/db/client";
import { actions, inspections } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Project — acties" };

export default async function ProjectActionsPage(props: PageProps<"/projecten/[id]/acties">) {
  const { id } = await props.params;
  const session = await requireSession();
  const rows = await db
    .select({ a: actions, title: inspections.title })
    .from(actions)
    .innerJoin(inspections, eq(inspections.id, actions.inspectionId))
    .where(and(eq(actions.orgId, session.org.id), eq(actions.projectId, id)))
    .orderBy(asc(actions.status), asc(actions.dueDate));
  return (
    <PageBody>
      <ActionsTable
        inspectionId={null}
        showInspection
        canEdit={roleAtLeast(session.role, "schouwer")}
        findings={[]}
        rows={rows.map(({ a, title }) => ({ id: a.id, description: a.description, owner: a.owner, dueDate: a.dueDate, status: a.status, findingIds: a.findingIds, aiAccepted: a.aiAccepted, inspectionId: a.inspectionId, inspectionTitle: title }))}
      />
    </PageBody>
  );
}

import { and, desc, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { KlicPanel } from "@/components/projects/klic-panel";
import { db } from "@/db/client";
import { klicImports } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Project — documenten" };

export default async function ProjectDocumentsPage(props: PageProps<"/projecten/[id]/documenten">) {
  const { id } = await props.params;
  const session = await requireSession();
  const rows = await db
    .select({ id: klicImports.id, name: klicImports.name, meldingnummer: klicImports.meldingnummer, featureCount: klicImports.featureCount, visible: klicImports.visible, createdAt: klicImports.createdAt })
    .from(klicImports)
    .where(and(eq(klicImports.orgId, session.org.id), eq(klicImports.projectId, id)))
    .orderBy(desc(klicImports.createdAt));
  return (
    <PageBody>
      <h2 className="text-lg font-semibold">KLIC-leveringen</h2>
      <KlicPanel projectId={id} canEdit={roleAtLeast(session.role, "projectleider")} imports={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </PageBody>
  );
}

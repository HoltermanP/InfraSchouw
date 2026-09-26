import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryBadge, FindingStatusBadge, PriorityBadge, AiProposalBadge } from "@/components/common/status-badges";
import { db } from "@/db/client";
import { findings, inspections } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Project — bevindingen" };

export default async function ProjectFindingsPage(props: PageProps<"/projecten/[id]/bevindingen">) {
  const { id } = await props.params;
  const session = await requireSession();
  const rows = await db
    .select({ f: findings, inspectionTitle: inspections.title, date: inspections.startedAt })
    .from(findings)
    .innerJoin(inspections, eq(inspections.id, findings.inspectionId))
    .where(and(eq(findings.orgId, session.org.id), eq(findings.projectId, id)))
    .orderBy(asc(findings.status), asc(findings.priority));
  return (
    <PageBody>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bevinding</TableHead>
              <TableHead>Prioriteit</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Schouw</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Geen bevindingen.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ f, inspectionTitle, date }) => (
                <TableRow key={f.id}>
                  <TableCell className="max-w-md">
                    <Link href={`/schouwen/${f.inspectionId}/bevindingen#finding-${f.id}`} className="font-medium hover:underline">
                      {f.title}
                    </Link>
                    {!f.aiAccepted ? <AiProposalBadge className="ml-2" /> : null}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={f.priority} />
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={f.category} />
                  </TableCell>
                  <TableCell>
                    <FindingStatusBadge status={f.status} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {inspectionTitle}
                    <br />
                    {fmtDate(date)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}

import Link from "next/link";
import { PageBody } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InspectionStatusBadge, ReportStatusBadge } from "@/components/common/status-badges";
import { listInspections } from "@/db/queries/inspections";
import { requireSession } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Project — schouwen" };

export default async function ProjectInspectionsPage(props: PageProps<"/projecten/[id]/schouwen">) {
  const { id } = await props.params;
  const session = await requireSession();
  const rows = await listInspections(session.ctx, { projectId: id });
  return (
    <PageBody>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schouw</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Schouwer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verslag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nog geen schouwen.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.inspection.id}>
                  <TableCell>
                    <Link href={`/schouwen/${r.inspection.id}`} className="font-medium hover:underline">
                      {r.inspection.title}
                    </Link>
                  </TableCell>
                  <TableCell>{r.templateName}</TableCell>
                  <TableCell>{fmtDateTime(r.inspection.startedAt)}</TableCell>
                  <TableCell>{r.inspectorName ?? "—"}</TableCell>
                  <TableCell>
                    <InspectionStatusBadge status={r.inspection.status} />
                  </TableCell>
                  <TableCell>{r.reportStatus ? <ReportStatusBadge status={r.reportStatus} /> : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}

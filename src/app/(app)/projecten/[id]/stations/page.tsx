import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { PageBody } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { stations } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { STATION_STATUS_LABELS, STATION_TYPE_LABELS, roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Project — stations" };

export default async function ProjectStationsPage(props: PageProps<"/projecten/[id]/stations">) {
  const { id } = await props.params;
  const session = await requireSession();
  const rows = await db.select().from(stations).where(and(eq(stations.orgId, session.org.id), eq(stations.projectId, id))).orderBy(asc(stations.code));
  return (
    <PageBody>
      {roleAtLeast(session.role, "projectleider") ? (
        <Link href={`/stations/nieuw?project=${id}`} className={buttonVariants({ className: "w-fit" })}>
          <Plus /> Station toevoegen
        </Link>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Station</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Adres</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  Geen stations in dit project.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/stations/${s.id}`} className="font-medium hover:underline">
                      {s.code}
                    </Link>{" "}
                    <span className="text-muted-foreground">{s.name}</span>
                  </TableCell>
                  <TableCell>{STATION_TYPE_LABELS[s.stationType]}</TableCell>
                  <TableCell>{STATION_STATUS_LABELS[s.status]}</TableCell>
                  <TableCell>{s.address ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}

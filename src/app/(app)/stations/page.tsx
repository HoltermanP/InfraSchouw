import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StationsMap } from "@/components/stations/stations-map";
import { db } from "@/db/client";
import { inspections, projects, stations } from "@/db/schema";
import { orgWhere } from "@/db/scope";
import { requireSession } from "@/lib/auth/session";
import { STATION_STATUS_LABELS, STATION_TYPE_LABELS, roleAtLeast } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "MS-stations" };

export default async function StationsPage() {
  const session = await requireSession();
  const rows = await db
    .select({
      station: stations,
      projectNumber: projects.number,
      inspectionCount: sql<number>`(select count(*)::int from ${inspections} i where i.station_id = ${stations.id})`,
      lastInspection: sql<Date | null>`(select max(i.started_at) from ${inspections} i where i.station_id = ${stations.id})`,
    })
    .from(stations)
    .leftJoin(projects, eq(projects.id, stations.projectId))
    .where(orgWhere(stations, session.ctx))
    .orderBy(asc(stations.code));
  return (
    <>
      <PageHeader
        title="MS-stations"
        description="Stationsregister met historie van schouwen en installatiebeschrijvingen."
        actions={
          roleAtLeast(session.role, "projectleider") ? (
            <Link href="/stations/nieuw" className={buttonVariants()}>
              <Plus /> Nieuw station
            </Link>
          ) : null
        }
      />
      <PageBody>
        <StationsMap points={rows.filter((r) => r.station.lat !== null).map((r) => ({ id: r.station.id, lat: r.station.lat!, lon: r.station.lon!, label: `${r.station.code} – ${r.station.name}`, kind: "station" as const }))} />
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Project</TableHead>
                <TableHead className="text-right">Schouwen</TableHead>
                <TableHead className="hidden lg:table-cell">Laatste schouw</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nog geen stations.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ station, projectNumber, inspectionCount, lastInspection }) => (
                  <TableRow key={station.id}>
                    <TableCell>
                      <Link href={`/stations/${station.id}`} className="font-medium hover:underline">
                        {station.code}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {station.name}
                        {station.address ? ` · ${station.address}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{STATION_TYPE_LABELS[station.stationType]}</TableCell>
                    <TableCell>{STATION_STATUS_LABELS[station.status]}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs">{projectNumber ?? "—"}</TableCell>
                    <TableCell className="text-right">{inspectionCount}</TableCell>
                    <TableCell className="hidden lg:table-cell">{fmtDate(lastInspection)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Play } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InspectionStatusBadge, AsbuiltBadge } from "@/components/common/status-badges";
import { StationForm } from "@/components/stations/station-form";
import { ExpectedConfigEditor } from "@/components/stations/expected-config-editor";
import { StationsMap } from "@/components/stations/stations-map";
import { db } from "@/db/client";
import { asbuiltChecks, inspections, inspectionTemplates, stationDescriptions, stationExpectedConfigs, stations, users } from "@/db/schema";
import { orgWhere } from "@/db/scope";
import { listProjectOptions } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { STATION_STATUS_LABELS, STATION_TYPE_LABELS, STATION_HOUSING_LABELS, roleAtLeast } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "MS-station" };

export default async function StationPage(props: PageProps<"/stations/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await requireSession();
  const [station] = await db.select().from(stations).where(orgWhere(stations, session.ctx, eq(stations.id, id)));
  if (!station) notFound();
  const [history, [expected], [latestDesc], projects] = await Promise.all([
    db
      .select({ inspection: inspections, templateName: inspectionTemplates.name, inspector: users.name })
      .from(inspections)
      .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
      .leftJoin(users, eq(users.id, inspections.inspectorId))
      .where(and(eq(inspections.orgId, session.org.id), eq(inspections.stationId, id)))
      .orderBy(desc(inspections.startedAt)),
    db.select().from(stationExpectedConfigs).where(and(eq(stationExpectedConfigs.orgId, session.org.id), eq(stationExpectedConfigs.stationId, id))),
    db
      .select({ d: stationDescriptions, a: asbuiltChecks })
      .from(stationDescriptions)
      .leftJoin(asbuiltChecks, eq(asbuiltChecks.inspectionId, stationDescriptions.inspectionId))
      .where(and(eq(stationDescriptions.orgId, session.org.id), eq(stationDescriptions.stationId, id)))
      .orderBy(desc(stationDescriptions.updatedAt))
      .limit(1),
    listProjectOptions(session.ctx),
  ]);
  const v = latestDesc?.d.data.values;
  const canEdit = roleAtLeast(session.role, "projectleider");
  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/stations", label: "MS-stations" }, { label: station.code }]}
        title={`${station.code} — ${station.name}`}
        description={`${STATION_TYPE_LABELS[station.stationType]} · ${STATION_HOUSING_LABELS[station.housing]} · ${STATION_STATUS_LABELS[station.status]}${station.address ? ` · ${station.address}` : ""}`}
        actions={
          roleAtLeast(session.role, "schouwer") ? (
            <Link href={`/veld?nieuw=1&station=${station.id}${station.projectId ? `&project=${station.projectId}` : ""}`} className={buttonVariants()}>
              <Play /> Stationsschouw starten
            </Link>
          ) : null
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Laatste installatiebeschrijving</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {v ? (
                <dl className="grid grid-cols-2 gap-2">
                  <dt className="text-muted-foreground">MS-installatie</dt>
                  <dd>{[v.mv_switchgear.fabrikant, v.mv_switchgear.type].filter(Boolean).join(" ") || "—"}</dd>
                  <dt className="text-muted-foreground">Velden</dt>
                  <dd>{v.mv_switchgear.aantal_velden ?? v.mv_switchgear.velden.length ?? "—"}</dd>
                  <dt className="text-muted-foreground">Transformator(en)</dt>
                  <dd>{v.transformers.map((t) => `${t.fabrikant ?? ""} ${t.vermogen_kva ?? "?"} kVA`).join(", ") || "—"}</dd>
                  <dt className="text-muted-foreground">LS-groepen</dt>
                  <dd>{v.lv_board.aantal_groepen ?? v.lv_board.groepen.length ?? "—"}</dd>
                  <dt className="text-muted-foreground">Algemene staat</dt>
                  <dd className="capitalize">{v.overall_condition ?? "—"}</dd>
                  <dt className="text-muted-foreground">Vastgelegd</dt>
                  <dd>
                    <Link className="text-primary hover:underline" href={`/schouwen/${latestDesc!.d.inspectionId}/station`}>
                      {fmtDateTime(latestDesc!.d.updatedAt)}
                    </Link>
                  </dd>
                </dl>
              ) : (
                <p className="text-muted-foreground">Nog geen installatiebeschrijving. Start een stationsschouw.</p>
              )}
              {latestDesc?.a?.rows.length ? (
                <div className="mt-4">
                  <p className="mb-1 font-medium">As-built</p>
                  <ul className="flex flex-col gap-1">
                    {latestDesc.a.rows.map((r) => (
                      <li key={r.key} className="flex items-center justify-between gap-2">
                        <span>{r.label}</span>
                        <AsbuiltBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {station.lat !== null ? <StationsMap className="h-72" points={[{ id: station.id, lat: station.lat, lon: station.lon!, label: station.code, kind: "station" }]} /> : null}
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Verwachte configuratie (ontwerp)</h2>
          <p className="text-sm text-muted-foreground">Wordt bij de as-built-check vergeleken met wat tijdens de (opleverings)schouw is aangetroffen.</p>
          <ExpectedConfigEditor stationId={station.id} initial={expected?.config ?? null} canEdit={canEdit} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Historie van schouwen</h2>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schouw</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Schouwer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Nog geen schouwen.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.inspection.id}>
                      <TableCell>
                        <Link href={`/schouwen/${h.inspection.id}`} className="font-medium hover:underline">
                          {h.inspection.title}
                        </Link>
                      </TableCell>
                      <TableCell>{h.templateName}</TableCell>
                      <TableCell>{fmtDateTime(h.inspection.startedAt)}</TableCell>
                      <TableCell>{h.inspector ?? "—"}</TableCell>
                      <TableCell>
                        <InspectionStatusBadge status={h.inspection.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {canEdit ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Stationsgegevens</h2>
            <StationForm
              id={station.id}
              projects={projects}
              initial={{
                code: station.code,
                name: station.name,
                address: station.address,
                lat: station.lat,
                lon: station.lon,
                owner: station.owner,
                stationType: station.stationType,
                housing: station.housing,
                buildYear: station.buildYear,
                status: station.status,
                projectId: station.projectId,
                notes: station.notes,
              }}
            />
          </section>
        ) : null}
      </PageBody>
    </>
  );
}

import Link from "next/link";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { ClipboardList, FileText, AlertTriangle, ListTodo, Play } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { InspectionStatusBadge, ReportStatusBadge, PriorityBadge } from "@/components/common/status-badges";
import { ActionsTable } from "@/components/inspections/actions-table";
import { StationsMap } from "@/components/stations/stations-map";
import { db } from "@/db/client";
import { actions, findings, inspections, inspectionTemplates, reports } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { fmtDateTime, fmtRelative } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const org = session.org.id;
  const [recent, openReports, openActions, highFindings, running, mapPoints] = await Promise.all([
    db
      .select({ i: inspections, t: inspectionTemplates.name })
      .from(inspections)
      .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
      .where(eq(inspections.orgId, org))
      .orderBy(desc(inspections.startedAt))
      .limit(8),
    db
      .select({ r: reports, title: inspections.title })
      .from(reports)
      .innerJoin(inspections, eq(inspections.id, reports.inspectionId))
      .where(and(eq(reports.orgId, org), ne(reports.status, "definitief")))
      .orderBy(desc(reports.updatedAt))
      .limit(8),
    db
      .select({ a: actions, title: inspections.title })
      .from(actions)
      .innerJoin(inspections, eq(inspections.id, actions.inspectionId))
      .where(and(eq(actions.orgId, org), inArray(actions.status, ["open", "in_uitvoering"])))
      .orderBy(asc(actions.dueDate))
      .limit(10),
    db
      .select({ f: findings, title: inspections.title })
      .from(findings)
      .innerJoin(inspections, eq(inspections.id, findings.inspectionId))
      .where(and(eq(findings.orgId, org), eq(findings.status, "open"), eq(findings.priority, "hoog")))
      .orderBy(desc(findings.createdAt))
      .limit(6),
    db.$count(inspections, and(eq(inspections.orgId, org), eq(inspections.status, "lopend"))),
    db
      .select({ id: inspections.id, lat: inspections.lat, lon: inspections.lon, title: inspections.title, status: inspections.status })
      .from(inspections)
      .where(eq(inspections.orgId, org))
      .orderBy(desc(inspections.startedAt))
      .limit(500),
  ]);
  const toReview = openReports.filter((r) => r.r.status === "ter_review").length;
  const kpis = [
    { label: "Lopende schouwen", value: running, icon: ClipboardList },
    { label: "Verslagen in behandeling", value: openReports.length, icon: FileText, sub: toReview ? `${toReview} ter review` : undefined },
    { label: "Open actiepunten", value: openActions.length, icon: ListTodo },
    { label: "Open bevindingen (hoog)", value: highFindings.length, icon: AlertTriangle },
  ];
  return (
    <>
      <PageHeader
        title={`Welkom, ${session.user.name.split(" ")[0]}`}
        description={session.org.name}
        actions={
          roleAtLeast(session.role, "schouwer") ? (
            <Link href="/veld?nieuw=1" className={buttonVariants()}>
              <Play /> Nieuwe schouw
            </Link>
          ) : null
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-kpis">
          {kpis.map((k) => (
            <Card key={k.label} size="sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                <k.icon className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{k.value}</p>
                {k.sub ? <p className="text-xs text-amber-700">{k.sub}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Recente schouwen</h2>
            <ul className="flex flex-col gap-1">
              {recent.length === 0 ? <li className="text-sm text-muted-foreground">Nog geen schouwen.</li> : null}
              {recent.map(({ i, t }) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/schouwen/${i.id}`} className="block truncate font-medium hover:underline">
                      {i.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t} · {fmtDateTime(i.startedAt)}
                    </span>
                  </span>
                  <InspectionStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Kaart — alle schouwen</h2>
            <StationsMap
              hrefBase="/schouwen"
              className="h-80"
              points={mapPoints.filter((p) => p.lat !== null).map((p) => ({ id: p.id, lat: p.lat!, lon: p.lon!, label: p.title, kind: "inspection" as const, color: p.status === "lopend" ? "#16a34a" : "#0f4c81" }))}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Openstaande verslagen</h2>
            <ul className="flex flex-col gap-1">
              {openReports.length === 0 ? <li className="text-sm text-muted-foreground">Geen openstaande verslagen.</li> : null}
              {openReports.map(({ r, title }) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/schouwen/${r.inspectionId}/verslag`} className="block truncate font-medium hover:underline">
                      {title}
                    </Link>
                    <span className="text-xs text-muted-foreground">bijgewerkt {fmtRelative(r.updatedAt)}</span>
                  </span>
                  <ReportStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Bevindingen met hoge prioriteit</h2>
            <ul className="flex flex-col gap-1">
              {highFindings.length === 0 ? <li className="text-sm text-muted-foreground">Geen open bevindingen met hoge prioriteit.</li> : null}
              {highFindings.map(({ f, title }) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/schouwen/${f.inspectionId}/bevindingen#finding-${f.id}`} className="block truncate font-medium hover:underline">
                      {f.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{title}</span>
                  </span>
                  <PriorityBadge priority={f.priority} />
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Open actiepunten</h2>
          <ActionsTable
            inspectionId={null}
            showInspection
            canEdit={roleAtLeast(session.role, "schouwer")}
            findings={[]}
            rows={openActions.map(({ a, title }) => ({ id: a.id, description: a.description, owner: a.owner, dueDate: a.dueDate, status: a.status, findingIds: a.findingIds, aiAccepted: a.aiAccepted, inspectionId: a.inspectionId, inspectionTitle: title }))}
          />
        </section>
      </PageBody>
    </>
  );
}

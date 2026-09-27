import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectMap } from "@/components/projects/project-map";
import { InspectionStatusBadge } from "@/components/common/status-badges";
import { db } from "@/db/client";
import { actions, billingItems, findings, inspections, inspectionTemplates, stations } from "@/db/schema";
import { getProject } from "@/db/queries/projects";
import { projectKlicLayer } from "@/db/queries/klic";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Project" };

export default async function ProjectOverviewPage(props: PageProps<"/projecten/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const project = await getProject(session.ctx, id);
  if (!project) notFound();
  const org = session.ctx.orgId;
  const [insp, sts, fnd, nOpenActions, nBilling, klic] = await Promise.all([
    db
      .select({ i: inspections, t: inspectionTemplates.name, tracksRoute: inspectionTemplates.tracksRoute })
      .from(inspections)
      .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
      .where(and(eq(inspections.orgId, org), eq(inspections.projectId, id)))
      .orderBy(desc(inspections.startedAt)),
    db.select().from(stations).where(and(eq(stations.orgId, org), eq(stations.projectId, id))),
    db.select().from(findings).where(and(eq(findings.orgId, org), eq(findings.projectId, id))),
    db.$count(actions, and(eq(actions.orgId, org), eq(actions.projectId, id), eq(actions.status, "open"))),
    db.$count(billingItems, and(eq(billingItems.orgId, org), eq(billingItems.projectId, id))),
    projectKlicLayer(org, id),
  ]);
  const stats = [
    { label: "Schouwen", value: insp.length },
    { label: "MS-stations", value: sts.length },
    { label: "Open bevindingen", value: fnd.filter((f) => f.status === "open").length },
    { label: "Open acties", value: nOpenActions },
    { label: "Afrekenposten", value: nBilling },
  ];
  return (
    <PageBody>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{s.value}</CardContent>
          </Card>
        ))}
      </div>
      <ProjectMap
        projectId={id}
        area={project.areaGeojson}
        canEdit={roleAtLeast(session.role, "projectleider")}
        klic={klic}
        inspections={insp.filter((r) => r.i.lat !== null).map((r) => ({ id: r.i.id, lat: r.i.lat!, lon: r.i.lon!, label: `${r.t}: ${r.i.title}`, kind: "inspection" as const }))}
        stations={sts.filter((s) => s.lat !== null).map((s) => ({ id: s.id, lat: s.lat!, lon: s.lon!, label: `${s.code} – ${s.name}`, kind: "station" as const }))}
        // Location inspections appear as their single point; only route inspections show findings along the route.
        findings={fnd.filter((f) => f.lat !== null && insp.some((r) => r.i.id === f.inspectionId && r.tracksRoute)).map((f) => ({ id: f.id, lat: f.lat!, lon: f.lon!, priority: f.priority, title: f.title, inspectionId: f.inspectionId }))}
      />
      {project.description ? <p className="max-w-3xl text-sm">{project.description}</p> : null}
      <section>
        <h2 className="mb-2 font-semibold">Recente schouwen</h2>
        <ul className="flex flex-col gap-1">
          {insp.slice(0, 6).map((r) => (
            <li key={r.i.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
              <Link href={`/schouwen/${r.i.id}`} className="font-medium hover:underline">
                {r.i.title}
              </Link>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {fmtDateTime(r.i.startedAt)} <InspectionStatusBadge status={r.i.status} />
              </span>
            </li>
          ))}
          {insp.length === 0 ? <li className="text-sm text-muted-foreground">Nog geen schouwen in dit project.</li> : null}
        </ul>
      </section>
    </PageBody>
  );
}

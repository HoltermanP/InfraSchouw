import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { actions, billingItems, findings, inspections, stations } from "@/db/schema";
import { getProject } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Project" };

export default async function ProjectOverviewPage(props: PageProps<"/projecten/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const project = await getProject(session.ctx, id);
  if (!project) notFound();
  const org = session.ctx.orgId;
  const [nInspections, nStations, nOpenFindings, nOpenActions, nBilling] = await Promise.all([
    db.$count(inspections, and(eq(inspections.orgId, org), eq(inspections.projectId, id))),
    db.$count(stations, and(eq(stations.orgId, org), eq(stations.projectId, id))),
    db.$count(findings, and(eq(findings.orgId, org), eq(findings.projectId, id), eq(findings.status, "open"))),
    db.$count(actions, and(eq(actions.orgId, org), eq(actions.projectId, id), eq(actions.status, "open"))),
    db.$count(billingItems, and(eq(billingItems.orgId, org), eq(billingItems.projectId, id))),
  ]);
  const stats = [
    { label: "Schouwen", value: nInspections },
    { label: "MS-stations", value: nStations },
    { label: "Open bevindingen", value: nOpenFindings },
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
      {project.description ? <p className="max-w-3xl text-sm">{project.description}</p> : null}
    </PageBody>
  );
}

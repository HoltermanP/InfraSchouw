import Link from "next/link";
import { notFound } from "next/navigation";
import { CloudSun, MapPin, User, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";
import { InspectionStatusBadge, ReportStatusBadge } from "@/components/common/status-badges";
import { DeleteInspectionButton, LinkProjectButton, ProcessingButtons } from "@/components/inspections/header-actions";
import { ExportMenu } from "@/components/inspections/export-menu";
import { AiStatus } from "@/components/inspections/ai-status";
import { getInspectionHeader } from "@/db/queries/inspections";
import { listProjectOptions } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { formatWeather } from "@/lib/geo/weather";

export default async function InspectionLayout(props: LayoutProps<"/schouwen/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await requireSession();
  const header = await getInspectionHeader(session.ctx, id);
  if (!header) notFound();
  const { inspection, template, project, station, inspector, report } = header;
  const projects = roleAtLeast(session.role, "schouwer") ? await listProjectOptions(session.ctx) : [];
  const base = `/schouwen/${id}`;
  const tabs = [
    { href: base, label: "Kaart" },
    { href: `${base}/tijdlijn`, label: "Tijdlijn" },
    { href: `${base}/media`, label: "Media" },
    { href: `${base}/bevindingen`, label: "Bevindingen" },
    { href: `${base}/acties`, label: "Acties" },
    { href: `${base}/checklist`, label: "Checklist" },
    ...(template.isStation && inspection.stationId ? [{ href: `${base}/station`, label: "Station" }] : []),
    ...(template.isBilling && inspection.projectId ? [{ href: `${base}/afrekening`, label: "Afrekening" }] : []),
    { href: `${base}/verslag`, label: "Verslag" },
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { href: "/schouwen", label: "Schouwen" },
          ...(project ? [{ href: `/projecten/${project.id}`, label: project.number }] : []),
          { label: template.name },
        ]}
        title={inspection.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <InspectionStatusBadge status={inspection.status} />
            {report ? <ReportStatusBadge status={report.status} /> : null}
            <span>{template.name}</span>
            {project ? (
              <Link href={`/projecten/${project.id}`} className="hover:underline">
                {project.number} – {project.name}
              </Link>
            ) : (
              <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Losse schouw</span>
            )}
            {station ? (
              <Link href={`/stations/${station.id}`} className="flex items-center gap-1 hover:underline">
                <Zap className="size-3.5" /> {station.code}
              </Link>
            ) : null}
            <span className="flex items-center gap-1">
              <User className="size-3.5" /> {inspector?.name ?? "—"}
            </span>
            <span>{fmtDateTime(inspection.startedAt)}</span>
            {inspection.address ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {inspection.address}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <CloudSun className="size-3.5" /> {formatWeather(inspection.weather)}
            </span>
          </span>
        }
        actions={
          <>
            {roleAtLeast(session.role, "schouwer") ? <LinkProjectButton inspectionId={id} currentProjectId={inspection.projectId} projects={projects} /> : null}
            {roleAtLeast(session.role, "schouwer") ? <ProcessingButtons inspectionId={id} status={inspection.status} /> : null}
            <ExportMenu inspectionId={id} reportId={report?.id ?? null} canShare={roleAtLeast(session.role, "projectleider")} />
            {roleAtLeast(session.role, "admin") ? <DeleteInspectionButton inspectionId={id} title={inspection.title} /> : null}
          </>
        }
      />
      <TabNav items={tabs} />
      <AiStatus orgId={session.org.id} inspectionId={id} />
      {props.children}
    </>
  );
}

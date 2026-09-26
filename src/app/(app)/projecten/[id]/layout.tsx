import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";
import { ProjectStatusBadge } from "@/components/common/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { getProject } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { PROJECT_PHASE_LABELS, roleAtLeast } from "@/lib/domain";

export default async function ProjectLayout(props: LayoutProps<"/projecten/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const project = await getProject(session.ctx, id).catch(() => null);
  if (!project) notFound();
  const base = `/projecten/${id}`;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/projecten", label: "Projecten" }, { label: project.number }]}
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{project.number}</span>
            {project.client ? <span>· {project.client}</span> : null}
            <span>· {project.contractForm}</span>
            <span>· {PROJECT_PHASE_LABELS[project.phase]}</span>
            <ProjectStatusBadge status={project.status} />
          </span>
        }
        actions={
          roleAtLeast(session.role, "schouwer") ? (
            <Link href={`/veld?nieuw=1&project=${id}`} className={buttonVariants()} data-testid="start-inspection-from-project">
              <Play /> Schouw starten
            </Link>
          ) : null
        }
      />
      <TabNav
        items={[
          { href: base, label: "Overzicht" },
          { href: `${base}/schouwen`, label: "Schouwen" },
          { href: `${base}/stations`, label: "Stations" },
          { href: `${base}/bevindingen`, label: "Bevindingen" },
          { href: `${base}/acties`, label: "Acties" },
          { href: `${base}/afrekening`, label: "Afrekenposten" },
          { href: `${base}/documenten`, label: "Documenten" },
          { href: `${base}/team`, label: "Team" },
          { href: `${base}/instellingen`, label: "Instellingen" },
        ]}
      />
      {props.children}
    </>
  );
}

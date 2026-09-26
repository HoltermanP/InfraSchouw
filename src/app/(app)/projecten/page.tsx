import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectStatusBadge } from "@/components/common/status-badges";
import { listProjects } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { PROJECT_PHASES, PROJECT_PHASE_LABELS, PROJECT_STATUSES, PROJECT_STATUS_LABELS, roleAtLeast, type ProjectPhase, type ProjectStatus } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Projecten" };

export default async function ProjectsPage(props: PageProps<"/projecten">) {
  const session = await requireSession();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = PROJECT_STATUSES.includes(sp.status as ProjectStatus) ? (sp.status as ProjectStatus) : undefined;
  const phase = PROJECT_PHASES.includes(sp.fase as ProjectPhase) ? (sp.fase as ProjectPhase) : undefined;
  const rows = await listProjects(session.ctx, { q, status, phase });

  return (
    <>
      <PageHeader
        title="Projecten"
        description="Alle infraprojecten van je organisatie."
        actions={
          roleAtLeast(session.role, "projectleider") ? (
            <Link href="/projecten/nieuw" className={buttonVariants()}>
              <Plus /> Nieuw project
            </Link>
          ) : null
        }
      />
      <PageBody>
        <form className="flex flex-wrap items-end gap-2" role="search">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Zoek op naam, nummer, opdrachtgever" className="pl-8" aria-label="Zoeken" />
          </div>
          <NativeSelect name="status" defaultValue={status ?? ""} className="w-40" aria-label="Status">
            <option value="">Alle statussen</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="fase" defaultValue={phase ?? ""} className="w-40" aria-label="Fase">
            <option value="">Alle fasen</option>
            {PROJECT_PHASES.map((p) => (
              <option key={p} value={p}>
                {PROJECT_PHASE_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Filter
          </button>
        </form>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Geen projecten gevonden.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Naam</TableHead>
                  <TableHead className="hidden md:table-cell">Opdrachtgever</TableHead>
                  <TableHead className="hidden md:table-cell">Fase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Schouwen</TableHead>
                  <TableHead className="hidden lg:table-cell">Laatste schouw</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ project, inspectionCount, lastInspectionAt }) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-mono text-xs">{project.number}</TableCell>
                    <TableCell>
                      <Link href={`/projecten/${project.id}`} className="font-medium hover:underline">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{project.client ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{PROJECT_PHASE_LABELS[project.phase]}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="text-right">{inspectionCount}</TableCell>
                    <TableCell className="hidden lg:table-cell">{fmtDate(lastInspectionAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </>
  );
}

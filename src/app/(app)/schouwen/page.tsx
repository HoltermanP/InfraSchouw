import Link from "next/link";
import { Play } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InspectionStatusBadge, ReportStatusBadge } from "@/components/common/status-badges";
import { listInspections } from "@/db/queries/inspections";
import { listTemplates } from "@/db/queries/templates";
import { listOrgMembers, listProjectOptions } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { INSPECTION_STATUSES, INSPECTION_STATUS_LABELS, roleAtLeast, type InspectionStatus } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Schouwen" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function InspectionsPage(props: PageProps<"/schouwen">) {
  const session = await requireSession();
  const sp = await props.searchParams;
  const filters = {
    q: str(sp.q),
    templateId: str(sp.type),
    status: INSPECTION_STATUSES.includes(sp.status as InspectionStatus) ? (sp.status as InspectionStatus) : undefined,
    projectId: str(sp.project),
    inspectorId: str(sp.schouwer),
    from: str(sp.van),
    to: str(sp.tot),
    linked: sp.koppeling === "los" || sp.koppeling === "gekoppeld" ? (sp.koppeling as "los" | "gekoppeld") : undefined,
  };
  const [rows, templates, projectOptions, members] = await Promise.all([
    listInspections(session.ctx, filters),
    listTemplates(session.ctx),
    listProjectOptions(session.ctx),
    listOrgMembers(session.ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Schouwen"
        description="Alle schouwen van je organisatie — los of gekoppeld aan een project."
        actions={
          roleAtLeast(session.role, "schouwer") ? (
            <Link href="/veld?nieuw=1" className={buttonVariants()}>
              <Play /> Nieuwe schouw
            </Link>
          ) : null
        }
      />
      <PageBody>
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" role="search">
          <Input name="q" defaultValue={filters.q} placeholder="Zoek op titel" aria-label="Zoeken" className="lg:col-span-2" />
          <NativeSelect name="type" defaultValue={filters.templateId ?? ""} aria-label="Schouwtype">
            <option value="">Alle typen</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label="Status">
            <option value="">Alle statussen</option>
            {INSPECTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INSPECTION_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="project" defaultValue={filters.projectId ?? ""} aria-label="Project">
            <option value="">Alle projecten</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="koppeling" defaultValue={filters.linked ?? ""} aria-label="Los of gekoppeld">
            <option value="">Los en gekoppeld</option>
            <option value="los">Alleen losse schouwen</option>
            <option value="gekoppeld">Alleen gekoppeld</option>
          </NativeSelect>
          <NativeSelect name="schouwer" defaultValue={filters.inspectorId ?? ""} aria-label="Schouwer">
            <option value="">Alle schouwers</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </NativeSelect>
          <div className="flex gap-2 lg:col-span-2">
            <Input type="date" name="van" defaultValue={filters.from} aria-label="Vanaf datum" />
            <Input type="date" name="tot" defaultValue={filters.to} aria-label="Tot en met datum" />
          </div>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Filter
          </button>
        </form>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Schouw</TableHead>
                <TableHead className="hidden md:table-cell">Project</TableHead>
                <TableHead className="hidden lg:table-cell">Schouwer</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Verslag</TableHead>
                <TableHead className="text-right">Captures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Geen schouwen gevonden.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.inspection.id}>
                    <TableCell>
                      <Link href={`/schouwen/${r.inspection.id}`} className="font-medium hover:underline">
                        {r.inspection.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.templateName}
                        {r.stationCode ? ` · ${r.stationCode}` : ""}
                        {r.openFindings ? ` · ${r.openFindings} open bevinding(en)` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{r.projectNumber ? <span className="font-mono text-xs">{r.projectNumber}</span> : <span className="text-xs text-muted-foreground">Los</span>}</TableCell>
                    <TableCell className="hidden lg:table-cell">{r.inspectorName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.inspection.startedAt)}</TableCell>
                    <TableCell>
                      <InspectionStatusBadge status={r.inspection.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{r.reportStatus ? <ReportStatusBadge status={r.reportStatus} /> : "—"}</TableCell>
                    <TableCell className="text-right">{r.captureCount}</TableCell>
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

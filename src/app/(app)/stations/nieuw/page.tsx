import { PageBody, PageHeader } from "@/components/layout/page-header";
import { StationForm } from "@/components/stations/station-form";
import { listProjectOptions } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Nieuw station" };

export default async function NewStationPage(props: PageProps<"/stations/nieuw">) {
  const session = await requireSession("projectleider");
  const sp = await props.searchParams;
  const projects = await listProjectOptions(session.ctx);
  return (
    <>
      <PageHeader title="Nieuw MS-station" breadcrumbs={[{ href: "/stations", label: "MS-stations" }, { label: "Nieuw" }]} />
      <PageBody>
        <StationForm id={null} projects={projects} initial={{ projectId: typeof sp.project === "string" ? sp.project : null }} />
      </PageBody>
    </>
  );
}

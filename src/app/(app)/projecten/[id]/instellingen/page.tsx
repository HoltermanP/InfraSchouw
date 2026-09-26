import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { getProject } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";

export const metadata = { title: "Projectinstellingen" };

export default async function ProjectSettingsPage(props: PageProps<"/projecten/[id]/instellingen">) {
  const { id } = await props.params;
  const session = await requireSession();
  const project = await getProject(session.ctx, id);
  if (!project) notFound();
  if (!roleAtLeast(session.role, "projectleider")) {
    return (
      <PageBody>
        <p className="text-muted-foreground">Alleen projectleiders en beheerders kunnen projectinstellingen wijzigen.</p>
      </PageBody>
    );
  }
  return (
    <PageBody>
      <ProjectForm
        initial={{
          id: project.id,
          number: project.number,
          name: project.name,
          client: project.client,
          contractForm: project.contractForm,
          phase: project.phase,
          status: project.status,
          description: project.description,
          areaGeojson: project.areaGeojson,
        }}
      />
      {roleAtLeast(session.role, "admin") ? (
        <div className="max-w-3xl rounded-lg border border-destructive/30 p-4">
          <h2 className="font-semibold text-destructive">Project verwijderen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verwijdert het project, de afrekenposten en KLIC-lagen. Schouwen blijven bestaan als losse schouw.
          </p>
          <DeleteProjectButton id={project.id} />
        </div>
      ) : null}
    </PageBody>
  );
}

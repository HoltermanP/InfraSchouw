import { PageBody, PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Nieuw project" };

export default async function NewProjectPage() {
  await requireSession("projectleider");
  return (
    <>
      <PageHeader title="Nieuw project" breadcrumbs={[{ href: "/projecten", label: "Projecten" }, { label: "Nieuw" }]} />
      <PageBody>
        <ProjectForm />
      </PageBody>
    </>
  );
}

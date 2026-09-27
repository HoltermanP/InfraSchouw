import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { TemplateEditor } from "@/components/settings/template-editor";
import { getTemplateFull } from "@/db/queries/templates";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Template bewerken" };

export default async function TemplateEditPage(props: PageProps<"/instellingen/templates/[id]">) {
  const { id } = await props.params;
  const session = await requireSession("admin");
  const tpl = await getTemplateFull(session.ctx, id);
  if (!tpl) notFound();
  return (
    <PageBody>
      <TemplateEditor
        id={tpl.id}
        initial={{
          name: tpl.name,
          description: tpl.description,
          phase: tpl.phase,
          purposeText: tpl.purposeText,
          aiInstructions: tpl.aiInstructions,
          isStation: tpl.isStation,
          isBilling: tpl.isBilling,
          tracksRoute: tpl.tracksRoute,
          active: tpl.active,
          checklist: tpl.checklist.map((c) => ({ id: c.id, question: c.question, answerType: c.answerType, options: c.options, photoRequired: c.photoRequired, required: c.required })),
          shots: tpl.shots.map((s) => ({ id: s.id, groupName: s.groupName, title: s.title, description: s.description, required: s.required, stationComponent: s.stationComponent })),
          sections: tpl.sections.map((s) => ({ id: s.id, key: s.key, title: s.title, aiHint: s.aiHint })),
        }}
      />
    </PageBody>
  );
}

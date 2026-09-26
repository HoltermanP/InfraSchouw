import { notFound } from "next/navigation";
import { MediaGrid } from "@/components/inspections/media-grid";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext } from "@/lib/report/context";
import { captureDtos } from "@/lib/report/dto";

export const metadata = { title: "Schouw — media" };

export default async function MediaPage(props: PageProps<"/schouwen/[id]/media">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  return (
    <MediaGrid
      inspectionId={id}
      captures={captureDtos(ctx)}
      shots={ctx.template.shots.map((s) => ({ id: s.id, label: `${s.groupName} – ${s.title}` }))}
      findings={ctx.findings.map((f) => ({ id: f.id, title: f.title }))}
      canEdit={roleAtLeast(session.role, "schouwer")}
    />
  );
}

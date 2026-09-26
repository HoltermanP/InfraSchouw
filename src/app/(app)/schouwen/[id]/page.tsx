import { notFound } from "next/navigation";
import { InspectionMapView } from "@/components/inspections/inspection-map-view";
import { projectKlicLayer } from "@/db/queries/klic";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext } from "@/lib/report/context";
import { captureDtos } from "@/lib/report/dto";

export const metadata = { title: "Schouw — kaart" };

export default async function InspectionMapPage(props: PageProps<"/schouwen/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  const klic = await projectKlicLayer(session.org.id, ctx.inspection.projectId);
  return (
    <InspectionMapView
      inspectionId={id}
      reportId={ctx.report?.id ?? null}
      captures={captureDtos(ctx)}
      findings={ctx.findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        priority: f.priority,
        category: f.category,
        lat: f.lat,
        lon: f.lon,
        captureIds: f.captureIds,
        aiAccepted: f.aiAccepted,
        recommendation: f.recommendation,
      }))}
      track={ctx.track?.lineGeojson ?? null}
      area={ctx.project?.areaGeojson ?? null}
      klic={klic}
      canEdit={roleAtLeast(session.role, "schouwer")}
    />
  );
}

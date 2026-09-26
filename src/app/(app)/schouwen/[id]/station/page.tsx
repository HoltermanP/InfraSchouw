import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { StationDescriptionEditor } from "@/components/stations/station-description-editor";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext } from "@/lib/report/context";
import { emptyStationDescription } from "@/lib/station/schema";
import { captureUrl } from "@/lib/media-url";

export const metadata = { title: "Schouw — station" };

export default async function InspectionStationPage(props: PageProps<"/schouwen/[id]/station">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  if (!ctx.station) {
    return (
      <PageBody>
        <p className="text-muted-foreground">Deze schouw is niet aan een MS-station gekoppeld.</p>
      </PageBody>
    );
  }
  const doc = ctx.stationDescription?.data;
  const photos = ctx.captures.filter((c) => ["photo", "sketch", "video"].includes(c.type));
  return (
    <PageBody>
      <p className="text-sm">
        Station{" "}
        <Link href={`/stations/${ctx.station.id}`} className="font-medium text-primary hover:underline">
          {ctx.station.code} – {ctx.station.name}
        </Link>
        . Velden met <span className="rounded bg-violet-100 px-1 text-xs text-violet-800">AI</span> zijn voorstellen; zodra je een veld wijzigt wordt het{" "}
        <span className="rounded bg-sky-100 px-1 text-xs text-sky-800">Handmatig</span> en overschrijft een nieuwe AI-run het niet meer.
      </p>
      <StationDescriptionEditor
        key={ctx.stationDescription?.updatedAt.toISOString() ?? "leeg"}
        inspectionId={id}
        values={doc?.values ?? emptyStationDescription()}
        meta={doc?.fieldMeta ?? {}}
        asbuilt={ctx.asbuilt?.rows ?? []}
        hasExpected={Boolean(ctx.expectedConfig)}
        canEdit={roleAtLeast(session.role, "schouwer") && ctx.report?.status !== "definitief"}
        photos={photos.map((c) => ({ id: c.id, seq: c.seq, thumb: captureUrl(c.id, "thumb") }))}
        nameplates={photos
          .filter((c) => c.analysis?.nameplate)
          .map((c) => ({ captureId: c.id, seq: c.seq, thumb: captureUrl(c.id, "thumb"), caption: c.analysis!.caption, plate: c.analysis!.nameplate as Record<string, string | number | null> }))}
        shotCoverage={ctx.template.shots.map((s) => ({ title: s.title, group: s.groupName, required: s.required, done: ctx.captures.filter((c) => c.shotId === s.id).length }))}
      />
    </PageBody>
  );
}

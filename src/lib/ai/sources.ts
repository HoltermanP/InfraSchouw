import "server-only";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { InspectionContext } from "@/lib/report/context";
import { reportPhotos } from "@/lib/report/context";
import { CAPTURE_TYPE_LABELS } from "@/lib/domain";
import { formatWeather } from "@/lib/geo/weather";
import { imageDataUrl } from "./images";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Compact JSON description of all sources of an inspection for the report model. */
export function sourcesJson(ctx: InspectionContext) {
  const shots = new Map(ctx.template.shots.map((s) => [s.id, `${s.groupName} – ${s.title}`]));
  return {
    schouw: {
      titel: ctx.inspection.title,
      type: ctx.template.name,
      doel: ctx.template.purposeText,
      start: iso(ctx.inspection.startedAt),
      einde: iso(ctx.inspection.endedAt),
      adres: ctx.inspection.address,
      weer: formatWeather(ctx.inspection.weather),
      schouwer: ctx.inspector?.name ?? null,
      notities: ctx.inspection.notes,
      overgeslagen: ctx.inspection.skipped,
      gelopen_afstand_m: ctx.track ? Math.round(ctx.track.lengthM) : null,
    },
    secties: ctx.template.sections.map((s) => ({ key: s.key, titel: s.title, aanwijzing: s.aiHint })),
    project: ctx.project
      ? { nummer: ctx.project.number, naam: ctx.project.name, opdrachtgever: ctx.project.client, contractvorm: ctx.project.contractForm, fase: ctx.project.phase, omschrijving: ctx.project.description }
      : null,
    station: ctx.station
      ? { code: ctx.station.code, naam: ctx.station.name, type: ctx.station.stationType, behuizing: ctx.station.housing, status: ctx.station.status, verwachte_configuratie: ctx.expectedConfig?.config ?? null }
      : null,
    captures: ctx.captures.map((c) => ({
      capture_id: c.id,
      type: CAPTURE_TYPE_LABELS[c.type],
      fotonummer: c.seq,
      tijd: iso(c.capturedAt),
      locatie: c.lat !== null && c.lon !== null ? { lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6) } : null,
      kijkrichting: c.heading !== null ? Math.round(c.heading) : null,
      shot: c.shotId ? shots.get(c.shotId) ?? null : null,
      tags: c.tags,
      notitie: c.note,
      tekst: c.textContent,
      verborgen_in_verslag: c.hiddenInReport,
      analyse: c.analysis
        ? {
            bijschrift: c.analysis.caption,
            beschrijving: c.analysis.description,
            mogelijke_bevindingen: c.analysis.possible_findings,
            typeplaat: c.analysis.nameplate,
            ocr: c.analysis.ocr_text,
            stationsonderdeel: c.analysis.station_component,
          }
        : null,
    })),
    transcriptie: ctx.segments.map((s) => ({ tijd: iso(s.startAt), tekst: s.text, capture_ids: s.captureIds })),
    metingen: ctx.measurements.map((m) => ({ label: m.label, soort: m.kind, waarde: m.value, eenheid: m.unit, foto: m.photoCaptureId, tijd: iso(m.measuredAt) })),
    bestaande_bevindingen: ctx.findings.map((f) => ({
      id: f.id,
      titel: f.title,
      omschrijving: f.description,
      categorie: f.category,
      prioriteit: f.priority,
      bron: f.source,
      capture_ids: f.captureIds,
      locatie: f.lat !== null ? { lat: f.lat, lon: f.lon } : null,
    })),
    checklist: ctx.template.checklist.map((item) => {
      const a = ctx.answers.find((x) => x.itemId === item.id);
      return { vraag: item.question, antwoord: a?.value ?? null, toelichting: a?.note ?? null, overgeslagen: a?.skippedReason ?? null, capture_ids: a?.captureIds ?? [] };
    }),
    afrekenposten: ctx.template.isBilling
      ? ctx.billingItems.map((b) => ({ post_code: b.code, omschrijving: b.description, eenheid: b.unit, gepland: b.plannedQuantity }))
      : [],
    deelnemers: ctx.participants.map((p) => ({ naam: p.name, organisatie: p.organization, rol: p.role })),
  };
}

/** Sources + a selection of photos (low detail) as model input. */
export async function sourcesContent(ctx: InspectionContext, maxImages = 16): Promise<ResponseInputContent[]> {
  const content: ResponseInputContent[] = [{ type: "input_text", text: `BRONNEN (JSON):\n${JSON.stringify(sourcesJson(ctx))}` }];
  const photos = reportPhotos(ctx).filter((c) => c.type !== "video" && (c.thumbUrl || c.blobUrl));
  const step = photos.length > maxImages ? photos.length / maxImages : 1;
  for (let i = 0; i < photos.length && content.length <= maxImages * 2; i += step) {
    const c = photos[Math.floor(i)]!;
    const url = await imageDataUrl((c.thumbUrl ?? c.blobUrl)!, 768);
    if (!url) continue;
    content.push({ type: "input_text", text: `Foto capture_id=${c.id} (fotonummer ${c.seq ?? "-"})` });
    content.push({ type: "input_image", image_url: url, detail: "low" });
  }
  return content;
}

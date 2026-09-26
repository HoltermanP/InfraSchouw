import "server-only";
import { CAPTURE_TYPE_LABELS, FINDING_CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/domain";
import type { InspectionContext } from "@/lib/report/context";

/** GeoJSON (RFC 7946, WGS84) of captures, findings, measurements, track and station — for GIS. */
export function inspectionGeoJson(ctx: InspectionContext): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const c of ctx.captures) {
    if (c.lat === null || c.lon === null) continue;
    features.push({
      type: "Feature",
      id: c.id,
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: {
        laag: "capture",
        type: CAPTURE_TYPE_LABELS[c.type],
        fotonummer: c.seq,
        tijd: c.capturedAt.toISOString(),
        rd_x: c.rdX,
        rd_y: c.rdY,
        nauwkeurigheid_m: c.accuracy,
        richting_graden: c.heading,
        locatiebron: c.locationSource,
        bijschrift: c.analysis?.caption ?? null,
        notitie: c.note,
        tekst: c.textContent,
        tags: c.tags.join(","),
      },
    });
  }
  ctx.findings.forEach((f, i) => {
    if (f.lat === null || f.lon === null) return;
    features.push({
      type: "Feature",
      id: f.id,
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      properties: {
        laag: "bevinding",
        nummer: `B${i + 1}`,
        titel: f.title,
        omschrijving: f.description,
        prioriteit: PRIORITY_LABELS[f.priority],
        categorie: FINDING_CATEGORY_LABELS[f.category],
        status: f.status,
        aanbeveling: f.recommendation,
        fotos: f.captureIds.map((id) => ctx.captures.find((c) => c.id === id)?.seq).filter(Boolean).join(","),
      },
    });
  });
  for (const m of ctx.measurements) {
    if (m.lat === null || m.lon === null) continue;
    features.push({ type: "Feature", id: m.id, geometry: { type: "Point", coordinates: [m.lon, m.lat] }, properties: { laag: "meting", soort: m.kind, omschrijving: m.label, waarde: m.value, eenheid: m.unit, tijd: m.measuredAt.toISOString() } });
  }
  if (ctx.track?.lineGeojson) {
    features.push({ type: "Feature", id: `track-${ctx.inspection.id}`, geometry: ctx.track.lineGeojson, properties: { laag: "gps-track", lengte_m: Math.round(ctx.track.lengthM), punten: ctx.track.pointCount } });
  }
  if (ctx.station?.lat !== null && ctx.station?.lon !== null && ctx.station) {
    features.push({ type: "Feature", id: ctx.station.id, geometry: { type: "Point", coordinates: [ctx.station.lon!, ctx.station.lat!] }, properties: { laag: "station", code: ctx.station.code, naam: ctx.station.name } });
  }
  return {
    type: "FeatureCollection",
    features,
    // Non-standard but widely read by GIS tools.
    ...({ name: ctx.inspection.title, schouw_id: ctx.inspection.id } as object),
  } as GeoJSON.FeatureCollection;
}

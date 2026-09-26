import "server-only";
import JSZip from "jszip";
import type { InspectionContext } from "@/lib/report/context";
import { extensionFor, getObjectBuffer } from "@/lib/storage";
import { inspectionGeoJson } from "./geojson";

/** ZIP with all original media, metadata JSON, GeoJSON and (if available) the report PDF. */
export async function renderInspectionZip(ctx: InspectionContext, pdf: { buffer: Buffer; name: string } | null): Promise<Buffer> {
  const zip = new JSZip();
  const media = zip.folder("media")!;
  const files: Record<string, string> = {};
  for (const c of ctx.captures) {
    if (!c.blobUrl) continue;
    const obj = await getObjectBuffer(c.blobUrl);
    if (!obj) continue;
    const name = `${String(c.seq ?? 0).padStart(3, "0")}_${c.type}_${c.capturedAt.toISOString().replace(/[:.]/g, "-")}_${c.id.slice(0, 8)}.${extensionFor(c.mime ?? obj.contentType)}`;
    media.file(name, obj.buffer);
    files[c.id] = `media/${name}`;
  }
  const signatures = zip.folder("handtekeningen")!;
  for (const p of ctx.participants) {
    if (!p.signatureUrl) continue;
    const obj = await getObjectBuffer(p.signatureUrl);
    if (obj) signatures.file(`${p.name.replace(/[^\p{L}\p{N} _-]+/gu, "")}.png`, obj.buffer);
  }
  const metadata = {
    export: { tool: "InfraSchouw", created_at: new Date().toISOString() },
    schouw: {
      id: ctx.inspection.id,
      titel: ctx.inspection.title,
      type: ctx.template.name,
      status: ctx.inspection.status,
      start: ctx.inspection.startedAt,
      einde: ctx.inspection.endedAt,
      adres: ctx.inspection.address,
      weer: ctx.inspection.weather,
      project: ctx.project ? { nummer: ctx.project.number, naam: ctx.project.name, opdrachtgever: ctx.project.client } : null,
      station: ctx.station ? { code: ctx.station.code, naam: ctx.station.name } : null,
      schouwer: ctx.inspector?.name ?? null,
      overgeslagen: ctx.inspection.skipped,
    },
    captures: ctx.captures.map((c) => ({
      id: c.id,
      bestand: files[c.id] ?? null,
      type: c.type,
      fotonummer: c.seq,
      tijd: c.capturedAt,
      lat: c.lat,
      lon: c.lon,
      rd_x: c.rdX,
      rd_y: c.rdY,
      nauwkeurigheid: c.accuracy,
      richting: c.heading,
      locatiebron: c.locationSource,
      bron: c.source,
      tags: c.tags,
      notitie: c.note,
      tekst: c.textContent,
      exif: c.exif,
      ai_analyse: c.analysis,
    })),
    transcripties: ctx.transcripts.map((t) => ({ capture_id: t.captureId, model: t.model, tekst: t.text })),
    transcriptsegmenten: ctx.segments.map((s) => ({ start: s.startAt, einde: s.endAt, tekst: s.text, capture_ids: s.captureIds })),
    metingen: ctx.measurements,
    bevindingen: ctx.findings,
    acties: ctx.actions,
    checklist: ctx.template.checklist.map((item) => ({ vraag: item.question, antwoord: ctx.answers.find((a) => a.itemId === item.id) ?? null })),
    deelnemers: ctx.participants.map((p) => ({ naam: p.name, organisatie: p.organization, rol: p.role, getekend_op: p.signedAt })),
    installatiebeschrijving: ctx.stationDescription?.data ?? null,
    asbuilt: ctx.asbuilt?.rows ?? null,
  };
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));
  zip.file("schouw.geojson", JSON.stringify(inspectionGeoJson(ctx), null, 2));
  if (pdf) zip.file(pdf.name, pdf.buffer);
  zip.file(
    "LEESMIJ.txt",
    `Export van schouw "${ctx.inspection.title}" uit InfraSchouw.\n\nmedia/            originele foto's, video's en audio (bestandsnaam begint met het fotonummer)\nmetadata.json     alle gegevens, inclusief AI-analyses, transcripties en EXIF\nschouw.geojson    locaties (WGS84) van captures, bevindingen, metingen en de GPS-track\n${pdf ? `${pdf.name}  het schouwverslag\n` : ""}`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

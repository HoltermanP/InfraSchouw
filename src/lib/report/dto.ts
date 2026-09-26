import "server-only";
import type { InspectionContext } from "./context";
import { captureUrl } from "@/lib/media-url";

/** Serializable capture info for client views (map side panel, media grid, timeline, editor). */
export function captureDtos(ctx: InspectionContext, shareToken?: string | null) {
  const shots = new Map(ctx.template.shots.map((s) => [s.id, `${s.groupName} – ${s.title}`]));
  const findingsByCapture = new Map<string, { id: string; title: string; priority: string }[]>();
  for (const f of ctx.findings) for (const cid of f.captureIds) findingsByCapture.set(cid, [...(findingsByCapture.get(cid) ?? []), { id: f.id, title: f.title, priority: f.priority }]);
  const segmentsByCapture = new Map<string, string[]>();
  for (const s of ctx.segments) for (const cid of s.captureIds) segmentsByCapture.set(cid, [...(segmentsByCapture.get(cid) ?? []), s.text]);
  const transcriptByAudio = new Map(ctx.transcripts.map((t) => [t.captureId, t.text]));
  return ctx.captures.map((c) => ({
    id: c.id,
    type: c.type,
    seq: c.seq,
    lat: c.lat,
    lon: c.lon,
    rdX: c.rdX,
    rdY: c.rdY,
    accuracy: c.accuracy,
    heading: c.heading,
    locationSource: c.locationSource,
    capturedAt: c.capturedAt.toISOString(),
    durationMs: c.durationMs,
    mime: c.mime,
    note: c.note,
    tags: c.tags,
    textContent: c.textContent,
    hiddenInReport: c.hiddenInReport,
    privacyBlurred: c.privacyBlurred,
    parentCaptureId: c.parentCaptureId,
    source: c.source,
    shot: c.shotId ? (shots.get(c.shotId) ?? null) : null,
    shotId: c.shotId,
    hasFile: Boolean(c.blobUrl),
    keyframeCount: c.meta.keyframes?.length ?? 0,
    url: c.blobUrl ? captureUrl(c.id, "orig", shareToken) : null,
    thumb: c.blobUrl || c.thumbUrl ? captureUrl(c.id, "thumb", shareToken) : null,
    analysis: c.analysis
      ? {
          caption: c.analysis.caption,
          description: c.analysis.description,
          tags: c.analysis.tags,
          nameplate: c.analysis.nameplate,
          ocr: c.analysis.ocr_text,
          stationComponent: c.analysis.station_component,
          privacy: c.analysis.privacy_flags,
          possibleFindings: c.analysis.possible_findings,
        }
      : null,
    transcript: [...(segmentsByCapture.get(c.id) ?? []), ...(transcriptByAudio.get(c.id) ? [transcriptByAudio.get(c.id)!] : [])],
    findings: findingsByCapture.get(c.id) ?? [],
  }));
}
export type CaptureDto = ReturnType<typeof captureDtos>[number];

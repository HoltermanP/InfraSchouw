import { readExif } from "../geo/exif";
import { matchTimestampToTrack, type TrackPoint } from "../geo/track-matching";
import { extractVideoKeyframes, makeThumbnail, mediaDurationMs } from "../media/client";
import type { CaptureSourceKind, CaptureType } from "../domain";
import type { CaptureDraft, CaptureSource } from "./types";

export class FileImportSource implements CaptureSource {
  readonly kind: CaptureSourceKind = "file-import";
  readonly label = "Bestandsimport (galerij / brilgeheugen)";
  async isAvailable() {
    return true;
  }
}

function typeFor(file: File): CaptureType | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/\.(jpe?g|png|heic|webp)$/i.test(file.name)) return "photo";
  if (/\.(mp4|mov|webm)$/i.test(file.name)) return "video";
  if (/\.(m4a|mp3|wav|ogg|webm)$/i.test(file.name)) return "audio";
  return null;
}

/**
 * Turn imported files into capture drafts: EXIF GPS/time/direction where
 * present; without EXIF GPS the location is derived by matching the capture
 * time against the inspection's GPS track.
 */
export async function draftsFromFiles(
  files: File[],
  opts: { source?: CaptureSourceKind; track?: TrackPoint[]; newId?: () => string; /** false: the inspection location is used, no warning. */ perCaptureLocation?: boolean } = {},
): Promise<{ draft: CaptureDraft; file: File; warning: string | null }[]> {
  const out: { draft: CaptureDraft; file: File; warning: string | null }[] = [];
  for (const file of files) {
    const type = typeFor(file);
    if (!type) {
      out.push({
        file,
        warning: "Bestandstype niet ondersteund",
        draft: { id: "", type: "photo", source: "file-import", capturedAt: new Date(), lat: null, lon: null, accuracy: null, heading: null, locationSource: "none" },
      });
      continue;
    }
    const exif = type === "photo" ? await readExif(file) : null;
    const capturedAt = exif?.takenAt ?? new Date(file.lastModified || Date.now());
    let lat = exif?.lat ?? null;
    let lon = exif?.lon ?? null;
    let locationSource: CaptureDraft["locationSource"] = lat !== null ? "exif" : "none";
    let warning: string | null = null;
    if (lat === null && opts.track?.length) {
      const m = matchTimestampToTrack(opts.track, capturedAt.getTime());
      if (m) {
        lat = m.lat;
        lon = m.lon;
        locationSource = "track-match";
      }
    }
    if (lat === null && opts.perCaptureLocation !== false) warning = "Geen locatie gevonden (geen EXIF-GPS en geen passend GPS-track)";
    let thumb: Blob | null = null;
    let keyframes: { blob: Blob; offsetMs: number }[] | undefined;
    let durationMs: number | null = null;
    try {
      if (type === "photo") thumb = (await makeThumbnail(file)).blob;
      if (type === "video") {
        keyframes = await extractVideoKeyframes(file, 5, 12);
        thumb = keyframes[0]?.blob ?? null;
      }
      if (type === "video" || type === "audio") durationMs = await mediaDurationMs(file);
    } catch {
      warning = warning ?? "Voorbeeld kon niet worden gemaakt";
    }
    out.push({
      file,
      warning,
      draft: {
        id: opts.newId?.() ?? crypto.randomUUID(),
        type,
        source: opts.source ?? "file-import",
        capturedAt,
        blob: file,
        thumb,
        mime: file.type || null,
        durationMs,
        keyframes,
        lat,
        lon,
        accuracy: null,
        heading: exif?.heading ?? null,
        locationSource,
        meta: { fileName: file.name, width: exif?.width ?? undefined, height: exif?.height ?? undefined },
        exif: exif?.raw ?? null,
      },
    });
  }
  return out;
}

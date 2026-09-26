import type { CaptureSourceKind, CaptureType, LocationSource } from "../domain";

/**
 * A capture source produces capture drafts (media + metadata). Sources are
 * interchangeable: phone camera, file import, smart glasses in the browser,
 * and the server-side glasses ingest API all produce the same draft shape,
 * which is then stored through the same pipeline.
 */
export interface CaptureSource {
  readonly kind: CaptureSourceKind;
  readonly label: string;
  isAvailable(): Promise<boolean>;
}

export type GeoFix = { lat: number; lon: number; accuracy: number | null; heading: number | null; t: number };

export type CaptureDraft = {
  id: string;
  type: CaptureType;
  source: CaptureSourceKind;
  capturedAt: Date;
  blob?: Blob | null;
  thumb?: Blob | null;
  mime?: string | null;
  durationMs?: number | null;
  keyframes?: { blob: Blob; offsetMs: number }[];
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  heading: number | null;
  locationSource: LocationSource;
  shotId?: string | null;
  tags?: string[];
  note?: string | null;
  textContent?: string | null;
  parentCaptureId?: string | null;
  meta?: Record<string, unknown>;
  exif?: Record<string, unknown> | null;
};

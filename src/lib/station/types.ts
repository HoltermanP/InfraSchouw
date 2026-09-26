import type { z } from "zod";
import type { StationDescription, expectedStationConfigSchema } from "./schema";

export type FieldSource = "ai" | "handmatig" | "geimporteerd";
export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  ai: "AI-voorstel",
  handmatig: "Handmatig",
  geimporteerd: "Geïmporteerd",
};

export type FieldMeta = {
  source: FieldSource;
  confidence: number | null;
  updatedAt: string;
  updatedBy?: string | null;
};

/**
 * Stored station description: the plain values plus per-field provenance,
 * keyed by dotted path (e.g. `mv_switchgear.fabrikant`,
 * `transformers.0.vermogen_kva`, or `mv_switchgear.velden` for a whole array).
 */
export type StationDescriptionDoc = {
  values: StationDescription;
  fieldMeta: Record<string, FieldMeta>;
};

export type ExpectedStationConfig = z.output<typeof expectedStationConfigSchema>;

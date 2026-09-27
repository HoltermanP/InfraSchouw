import { z } from "zod";
import { FINDING_CATEGORIES, PRIORITIES } from "../domain";
import { stationDescriptionSchema } from "../station/schema";

/**
 * All AI outputs are validated against these schemas. They are written to be
 * compatible with OpenAI strict structured outputs: every property is
 * required, optionality is expressed with `.nullable()`.
 */

export const priorityEnum = z.enum(PRIORITIES);
export const categoryEnum = z.enum(FINDING_CATEGORIES);

export const nameplateSchema = z.object({
  merk: z.string().nullable(),
  type: z.string().nullable(),
  serienummer: z.string().nullable(),
  bouwjaar: z.number().nullable(),
  spanning: z.string().nullable(),
  vermogen: z.string().nullable(),
  stroom: z.string().nullable(),
  norm: z.string().nullable(),
});
export type Nameplate = z.infer<typeof nameplateSchema>;

export const STATION_COMPONENTS = [
  "buitenkant",
  "naamplaat",
  "toegang_fundatie",
  "kabelinvoer_buiten",
  "ms_ruimte",
  "ms_installatie",
  "ms_typeplaat",
  "ms_veld",
  "ms_eindsluitingen",
  "transformator",
  "trafo_typeplaat",
  "ls_rek",
  "ls_groepen",
  "kabelkelder",
  "aarding",
  "automatisering",
  "veiligheid",
  "afwerking",
  "overig",
] as const;
export const STATION_COMPONENT_LABELS: Record<(typeof STATION_COMPONENTS)[number], string> = {
  buitenkant: "Buitenkant",
  naamplaat: "Naamplaat / borden",
  toegang_fundatie: "Toegang / fundatie",
  kabelinvoer_buiten: "Kabelinvoer buitenzijde",
  ms_ruimte: "MS-ruimte",
  ms_installatie: "MS-installatie (RMU)",
  ms_typeplaat: "Typeplaat MS-installatie",
  ms_veld: "MS-veld",
  ms_eindsluitingen: "MS-eindsluitingen",
  transformator: "Transformator",
  trafo_typeplaat: "Typeplaat transformator",
  ls_rek: "LS-rek",
  ls_groepen: "LS-groepen",
  kabelkelder: "Kabelkelder / afdichting",
  aarding: "Aarding",
  automatisering: "Meet- en telecom",
  veiligheid: "Veiligheid",
  afwerking: "Eindafwerking",
  overig: "Overig",
};

export const captureAnalysisSchema = z.object({
  caption: z.string().describe("Eén zakelijke zin die beschrijft wat op de foto te zien is"),
  description: z.string().describe("Uitgebreide feitelijke beschrijving"),
  tags: z.array(z.string()),
  detected_objects: z.array(z.string()),
  possible_findings: z.array(
    z.object({
      category: categoryEnum,
      description: z.string(),
      priority: priorityEnum,
      confidence: z.number().min(0).max(1),
    }),
  ),
  ocr_text: z.string().nullable(),
  nameplate: nameplateSchema.nullable(),
  station_component: z.enum(STATION_COMPONENTS).nullable(),
  privacy_flags: z.object({
    persons_recognizable: z.boolean(),
    license_plates_visible: z.boolean(),
    notes: z.string().nullable(),
  }),
});
export type CaptureAnalysis = z.infer<typeof captureAnalysisSchema>;

/** Extraction of findings/measurements/actions from spoken text. */
export const transcriptExtractionSchema = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      category: categoryEnum,
      priority: priorityEnum,
      segment_index: z.number().int().nullable(),
    }),
  ),
  measurements: z.array(
    z.object({
      label: z.string(),
      kind: z.enum(["diepte", "lengte", "breedte", "aantal", "hoogte", "overig"]),
      value: z.number(),
      unit: z.string(),
      segment_index: z.number().int().nullable(),
    }),
  ),
  actions: z.array(
    z.object({
      description: z.string(),
      owner_suggestion: z.string().nullable(),
      due_suggestion: z.string().nullable(),
    }),
  ),
  corrected_segments: z
    .array(z.object({ segment_index: z.number().int(), text: z.string() }))
    .describe("Alleen segmenten waarin vaktermen verkeerd zijn verstaan, met gecorrigeerde tekst"),
});
export type TranscriptExtraction = z.infer<typeof transcriptExtractionSchema>;

export const reportBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({
    type: z.literal("photo"),
    capture_id: z.string(),
    caption: z.string().describe("Kort bijschrift (één zin)"),
    explanation: z.string().describe("Toelichting (2-4 zinnen): wat is zichtbaar en wat betekent dit voor de tekst ervoor"),
  }),
  z.object({ type: z.literal("photo_grid"), capture_ids: z.array(z.string()), caption: z.string().nullable() }),
  z.object({
    type: z.literal("table"),
    caption: z.string().nullable(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal("map"),
    bbox: z.array(z.number()).nullable().describe("[minLon, minLat, maxLon, maxLat] of null voor alles"),
  }),
  z.object({ type: z.literal("checklist") }),
  z.object({ type: z.literal("finding_ref"), finding_index: z.number().int() }),
]);
export type ReportBlock = z.infer<typeof reportBlockSchema>;

export const reportDraftSchema = z.object({
  title: z.string(),
  summary: z.string().describe("Managementsamenvatting, maximaal ca. 200 woorden"),
  key_points: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: priorityEnum,
      category: categoryEnum,
      finding_ids: z.array(z.string()).describe("Indexen (als string) van findings[] of bestaande bevinding-id's"),
      capture_ids: z.array(z.string()),
    }),
  ),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      blocks: z.array(reportBlockSchema),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string().nullable().describe("Id van een bestaande bevinding, of null voor een nieuwe"),
      title: z.string(),
      description: z.string(),
      location: z.object({ lat: z.number(), lon: z.number() }).nullable(),
      priority: priorityEnum,
      category: categoryEnum,
      capture_ids: z.array(z.string()),
      recommendation: z.string(),
    }),
  ),
  actions: z.array(
    z.object({
      description: z.string(),
      owner_suggestion: z.string().nullable(),
      due_suggestion: z.string().nullable(),
      finding_ids: z.array(z.string()),
    }),
  ),
  station: stationDescriptionSchema.nullable(),
  quantities: z
    .array(
      z.object({
        post_code: z.string(),
        found_quantity: z.number(),
        unit: z.string(),
        capture_ids: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        remark: z.string().nullable(),
      }),
    )
    .nullable(),
  open_questions: z.array(z.string()),
});
export type ReportDraft = z.infer<typeof reportDraftSchema>;

/** Output for regenerating a single section. */
export const sectionDraftSchema = z.object({
  key: z.string(),
  title: z.string(),
  blocks: z.array(reportBlockSchema),
  open_questions: z.array(z.string()),
});
export type SectionDraft = z.infer<typeof sectionDraftSchema>;

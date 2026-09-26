import { z } from "zod";

/**
 * StationDescription (section 8.3). All leaves are nullable so the same
 * schema can be used as an OpenAI strict structured-output schema.
 */
const ids = z.array(z.string()).describe("capture_ids die dit onderbouwen");

export const stationFieldSchema = z.object({
  positie: z.string().nullable(),
  functie: z.enum(["kabel", "trafo", "koppel", "meet", "reserve"]).nullable(),
  aanduiding: z.string().nullable(),
  beveiliging: z.string().nullable(),
  kabel_aangesloten: z.boolean().nullable(),
  capture_ids: ids,
});

export const transformerSchema = z.object({
  fabrikant: z.string().nullable(),
  type: z.string().nullable(),
  vermogen_kva: z.number().nullable(),
  primair_kv: z.number().nullable(),
  secundair_v: z.number().nullable(),
  schakelgroep: z.string().nullable(),
  koeling: z.string().nullable(),
  bouwjaar: z.number().nullable(),
  serienummer: z.string().nullable(),
  capture_ids: ids,
});

export const lvGroupSchema = z.object({
  nr: z.string().nullable(),
  zekering_a: z.number().nullable(),
  aanduiding: z.string().nullable(),
});

export const stationDescriptionSchema = z.object({
  exterior: z.object({
    type: z.string().nullable(),
    behuizing: z.string().nullable(),
    staat: z.string().nullable(),
    bereikbaarheid: z.string().nullable(),
    opmerkingen: z.string().nullable(),
    capture_ids: ids,
  }),
  mv_switchgear: z.object({
    fabrikant: z.string().nullable(),
    type: z.string().nullable(),
    bouwjaar: z.number().nullable(),
    serienummer: z.string().nullable(),
    nominale_spanning_kv: z.number().nullable(),
    isolatiemedium: z.enum(["SF6", "lucht", "vast", "olie"]).nullable(),
    aantal_velden: z.number().nullable(),
    velden: z.array(stationFieldSchema),
    capture_ids: ids,
  }),
  transformers: z.array(transformerSchema),
  lv_board: z.object({
    type: z.string().nullable(),
    aantal_groepen: z.number().nullable(),
    groepen: z.array(lvGroupSchema),
    capture_ids: ids,
  }),
  cables: z.object({
    mv_eindsluitingen: z.array(z.string()),
    lv_kabels: z.array(z.string()),
    invoer_afdichting: z.string().nullable(),
    capture_ids: ids,
  }),
  earthing: z.object({ beschrijving: z.string().nullable(), capture_ids: ids }),
  automation: z.object({
    rtu: z.string().nullable(),
    meters: z.string().nullable(),
    communicatie: z.string().nullable(),
    capture_ids: ids,
  }),
  safety: z.object({
    aanwezig: z.array(z.string()),
    ontbrekend: z.array(z.string()),
    capture_ids: ids,
  }),
  overall_condition: z.enum(["goed", "redelijk", "matig", "slecht"]).nullable(),
  remarks: z.string().nullable(),
});

export type StationDescription = z.infer<typeof stationDescriptionSchema>;

export function emptyStationDescription(): StationDescription {
  return {
    exterior: { type: null, behuizing: null, staat: null, bereikbaarheid: null, opmerkingen: null, capture_ids: [] },
    mv_switchgear: {
      fabrikant: null,
      type: null,
      bouwjaar: null,
      serienummer: null,
      nominale_spanning_kv: null,
      isolatiemedium: null,
      aantal_velden: null,
      velden: [],
      capture_ids: [],
    },
    transformers: [],
    lv_board: { type: null, aantal_groepen: null, groepen: [], capture_ids: [] },
    cables: { mv_eindsluitingen: [], lv_kabels: [], invoer_afdichting: null, capture_ids: [] },
    earthing: { beschrijving: null, capture_ids: [] },
    automation: { rtu: null, meters: null, communicatie: null, capture_ids: [] },
    safety: { aanwezig: [], ontbrekend: [], capture_ids: [] },
    overall_condition: null,
    remarks: null,
  };
}

export const expectedStationConfigSchema = z.object({
  stationstype: z.string().nullable().default(null),
  behuizing: z.string().nullable().default(null),
  rmu_fabrikant: z.string().nullable().default(null),
  rmu_type: z.string().nullable().default(null),
  aantal_velden: z.number().int().nullable().default(null),
  velden_functies: z.array(z.enum(["kabel", "trafo", "koppel", "meet", "reserve"])).default([]),
  isolatiemedium: z.string().nullable().default(null),
  trafo_aantal: z.number().int().nullable().default(null),
  trafo_vermogen_kva: z.number().nullable().default(null),
  trafo_fabrikant: z.string().nullable().default(null),
  ls_aantal_groepen: z.number().int().nullable().default(null),
  rtu_aanwezig: z.boolean().nullable().default(null),
  aantal_mv_eindsluitingen: z.number().int().nullable().default(null),
});
export type ExpectedStationConfigInput = z.input<typeof expectedStationConfigSchema>;

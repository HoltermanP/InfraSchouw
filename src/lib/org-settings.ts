import { z } from "zod";

export const orgSettingsSchema = z.object({
  branding: z
    .object({
      logoUrl: z.string().nullable().default(null),
      primaryColor: z.string().default("#0f4c81"),
      accentColor: z.string().default("#f59e0b"),
      footerText: z.string().default(""),
      companyName: z.string().default(""),
    })
    .default({ logoUrl: null, primaryColor: "#0f4c81", accentColor: "#f59e0b", footerText: "", companyName: "" }),
  ai: z
    .object({
      captureAnalysis: z.boolean().default(true),
      transcription: z.boolean().default(true),
      reportSynthesis: z.boolean().default(true),
      extraInstructions: z.string().default(""),
    })
    .default({ captureAnalysis: true, transcription: true, reportSynthesis: true, extraInstructions: "" }),
  export: z
    .object({
      findingsGrouping: z.enum(["thema", "locatie"]).default("thema"),
      includeTranscript: z.boolean().default(true),
      includePhotoRegister: z.boolean().default(true),
      paperSize: z.enum(["A4", "LETTER"]).default("A4"),
    })
    .default({ findingsGrouping: "thema", includeTranscript: true, includePhotoRegister: true, paperSize: "A4" }),
  privacy: z
    .object({
      retentionMonths: z.number().int().min(1).max(240).default(84),
    })
    .default({ retentionMonths: 84 }),
  field: z
    .object({
      gpsIntervalSeconds: z.number().int().min(1).max(120).default(5),
      maxVideoSeconds: z.number().int().min(10).max(1800).default(180),
      keyframeIntervalSeconds: z.number().int().min(1).max(60).default(5),
      accuracyWarningMeters: z.number().min(1).max(500).default(15),
    })
    .default({ gpsIntervalSeconds: 5, maxVideoSeconds: 180, keyframeIntervalSeconds: 5, accuracyWarningMeters: 15 }),
});

export type OrgSettings = z.input<typeof orgSettingsSchema>;
export type ResolvedOrgSettings = z.output<typeof orgSettingsSchema>;

export function resolveOrgSettings(raw: unknown): ResolvedOrgSettings {
  const parsed = orgSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : orgSettingsSchema.parse({});
}

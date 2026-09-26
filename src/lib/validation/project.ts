import { z } from "zod";
import { CONTRACT_FORMS, PROJECT_PHASES, PROJECT_STATUSES } from "../domain";

const position = z.tuple([z.number(), z.number()]).rest(z.number());
const ring = z.array(position).min(4);
export const polygonSchema = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) });
export const multiPolygonSchema = z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) });
export const areaSchema = z.union([polygonSchema, multiPolygonSchema]);

/** Accepts a bare geometry, a Feature or a FeatureCollection with polygon features. */
export function parseAreaGeoJson(input: unknown): z.infer<typeof areaSchema> | null {
  if (input === null || input === undefined || input === "") return null;
  let value: unknown = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new z.ZodError([{ code: "custom", path: ["areaGeojson"], message: "Geen geldige JSON", input: String(value).slice(0, 50) }]);
    }
  }
  const obj = value as { type?: string; geometry?: unknown; features?: { geometry?: unknown }[] };
  if (obj?.type === "Feature") value = obj.geometry;
  if (obj?.type === "FeatureCollection") {
    const polys = (obj.features ?? []).map((f) => f.geometry).filter(Boolean) as { type: string; coordinates: unknown }[];
    if (polys.length === 1) value = polys[0];
    else if (polys.length > 1) {
      value = {
        type: "MultiPolygon",
        coordinates: polys.flatMap((p) => (p.type === "Polygon" ? [p.coordinates] : p.type === "MultiPolygon" ? (p.coordinates as unknown[]) : [])),
      };
    }
  }
  return areaSchema.parse(value);
}

export const projectInputSchema = z.object({
  number: z.string().trim().min(1, "Projectnummer is verplicht").max(60),
  name: z.string().trim().min(2, "Naam is verplicht").max(200),
  client: z.string().trim().max(200).nullable().default(null),
  contractForm: z.enum(CONTRACT_FORMS),
  phase: z.enum(PROJECT_PHASES),
  status: z.enum(PROJECT_STATUSES).default("actief"),
  description: z.string().trim().max(5000).nullable().default(null),
  areaGeojson: z.unknown().optional(),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { klicImports } from "../schema";

/** All visible KLIC layers of a project merged into one FeatureCollection. */
export async function projectKlicLayer(orgId: string, projectId: string | null): Promise<GeoJSON.FeatureCollection | null> {
  if (!projectId) return null;
  const rows = await db
    .select({ geojson: klicImports.geojson })
    .from(klicImports)
    .where(and(eq(klicImports.orgId, orgId), eq(klicImports.projectId, projectId), eq(klicImports.visible, true)));
  if (rows.length === 0) return null;
  return { type: "FeatureCollection", features: rows.flatMap((r) => r.geojson.features) as GeoJSON.Feature[] };
}

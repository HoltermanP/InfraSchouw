type LatLonNullable = { lat: number | null; lon: number | null };

/**
 * The single location of a location inspection (every template without
 * tracksRoute): the inspection's own location, else the first located capture.
 * Maps show only this point for such inspections instead of a marker per capture.
 */
export function inspectionSite(inspection: LatLonNullable, captures: LatLonNullable[] = []): { lat: number; lon: number } | null {
  if (inspection.lat !== null && inspection.lon !== null) return { lat: inspection.lat, lon: inspection.lon };
  const c = captures.find((x) => x.lat !== null && x.lon !== null);
  return c ? { lat: c.lat!, lon: c.lon! } : null;
}

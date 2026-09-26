import proj4 from "proj4";

/** RD New (Amersfoort / RD New), EPSG:28992, with the standard 7-parameter datum shift. */
export const RD_NEW =
  "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs";

proj4.defs("EPSG:28992", RD_NEW);

const converter = proj4("EPSG:4326", "EPSG:28992");

export type RdPoint = { x: number; y: number };

export function wgs84ToRd(lat: number, lon: number): RdPoint {
  const [x, y] = converter.forward([lon, lat]) as [number, number];
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

export function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  const [lon, lat] = converter.inverse([x, y]) as [number, number];
  return { lat, lon };
}

/** Rough bounds of the RD grid (Netherlands incl. margin). */
export function isInNetherlands(lat: number, lon: number): boolean {
  return lat > 50.5 && lat < 53.8 && lon > 3.0 && lon < 7.5;
}

export function formatRd(x: number | null | undefined, y: number | null | undefined): string {
  if (x === null || x === undefined || y === null || y === undefined) return "—";
  return `X ${x.toFixed(2)} · Y ${y.toFixed(2)}`;
}

export function formatWgs84(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return "—";
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function headingLabel(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  const d = ((deg % 360) + 360) % 360;
  return `${Math.round(d)}° (${dirs[Math.round(d / 45) % 8]})`;
}

/** Haversine distance in metres. */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthMeters(points: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1]!, points[i]!);
  return total;
}

export type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

export function bboxOf(points: { lat: number; lon: number }[], padRatio = 0.1): BBox | null {
  if (points.length === 0) return null;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const p of points) {
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  const padLon = Math.max((maxLon - minLon) * padRatio, 0.0015);
  const padLat = Math.max((maxLat - minLat) * padRatio, 0.001);
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}

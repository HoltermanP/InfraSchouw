import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { PDOK_TILES, latToTileY, lonToTileX } from "@/lib/geo/pdok";
import { PRIORITY_COLORS, type Priority } from "@/lib/domain";
import { inspectionSite } from "@/lib/geo/site";
import type { InspectionContext } from "@/lib/report/context";

export type StaticMapInput = {
  width?: number;
  height?: number;
  photos: { lat: number; lon: number; nr: number | null }[];
  findings: { lat: number; lon: number; priority: Priority; nr?: number | null }[];
  track?: GeoJSON.LineString | null;
  area?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  extraPoints?: { lat: number; lon: number }[];
  /** Location inspection: one pin on the inspection location instead of photo/finding markers. */
  site?: { lat: number; lon: number } | null;
  basemap?: "brt" | "luchtfoto";
  fetchImpl?: typeof fetch;
};

const TILE = 256;

function worldPx(lat: number, lon: number, z: number) {
  return { x: lonToTileX(lon, z) * TILE, y: latToTileY(lat, z) * TILE };
}

/**
 * Render a static overview map (PNG) from PDOK WMTS tiles with the GPS track,
 * project area, numbered photo locations and finding markers. Used for the
 * PDF/Word overview map when no MapLibre snapshot was captured.
 */
export async function renderStaticMap(input: StaticMapInput): Promise<Buffer | null> {
  const width = input.width ?? 1600;
  const height = input.height ?? 1000;
  const pts: { lat: number; lon: number }[] = [...input.photos, ...input.findings, ...(input.extraPoints ?? []), ...(input.site ? [input.site] : [])];
  input.track?.coordinates.forEach(([lon, lat]) => pts.push({ lat: lat!, lon: lon! }));
  if (input.area) {
    const polys = input.area.type === "Polygon" ? [input.area.coordinates] : input.area.coordinates;
    polys.forEach((p) => p[0]?.forEach(([lon, lat]) => pts.push({ lat: lat!, lon: lon! })));
  }
  if (pts.length === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  // Pick the highest zoom where the bbox (with margin) fits.
  const margin = 80;
  let z = 19;
  for (; z > 5; z--) {
    const a = worldPx(maxLat, minLon, z);
    const b = worldPx(minLat, maxLon, z);
    if (b.x - a.x <= width - margin * 2 && b.y - a.y <= height - margin * 2) break;
  }
  z = Math.min(z, 18);
  const c1 = worldPx(maxLat, minLon, z);
  const c2 = worldPx(minLat, maxLon, z);
  const cx = (c1.x + c2.x) / 2;
  const cy = (c1.y + c2.y) / 2;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const project = (lat: number, lon: number) => {
    const p = worldPx(lat, lon, z);
    return { x: p.x - left, y: p.y - top };
  };

  const template = input.basemap === "luchtfoto" ? PDOK_TILES.luchtfoto : PDOK_TILES.brt;
  const fetchImpl = input.fetchImpl ?? fetch;
  const tx0 = Math.floor(left / TILE);
  const ty0 = Math.floor(top / TILE);
  const tx1 = Math.floor((left + width) / TILE);
  const ty1 = Math.floor((top + height) / TILE);
  const tiles: OverlayOptions[] = [];
  const jobs: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const url = template.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
      jobs.push(
        fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
          .then(async (res) => {
            if (!res.ok) return;
            const buf = Buffer.from(await res.arrayBuffer());
            const dx = Math.round(tx * TILE - left);
            const dy = Math.round(ty * TILE - top);
            // Crop tiles that stick out of the canvas (sharp requires overlays inside the image).
            const cropLeft = Math.max(0, -dx);
            const cropTop = Math.max(0, -dy);
            const w = Math.min(TILE - cropLeft, width - Math.max(dx, 0));
            const h = Math.min(TILE - cropTop, height - Math.max(dy, 0));
            if (w <= 0 || h <= 0) return;
            const piece = await sharp(buf).extract({ left: cropLeft, top: cropTop, width: w, height: h }).png().toBuffer();
            tiles.push({ input: piece, left: Math.max(dx, 0), top: Math.max(dy, 0) });
          })
          .catch(() => undefined),
      );
    }
  }
  await Promise.all(jobs);

  const svgParts: string[] = [];
  if (input.area) {
    const polys = input.area.type === "Polygon" ? [input.area.coordinates] : input.area.coordinates;
    for (const poly of polys) {
      const d = (poly[0] ?? []).map(([lon, lat], i) => {
        const p = project(lat!, lon!);
        return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      svgParts.push(`<path d="${d.join(" ")}Z" fill="#0f4c81" fill-opacity="0.08" stroke="#0f4c81" stroke-width="3" stroke-dasharray="10 6"/>`);
    }
  }
  if (input.track && input.track.coordinates.length > 1) {
    const d = input.track.coordinates
      .map(([lon, lat], i) => {
        const p = project(lat!, lon!);
        return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");
    svgParts.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`);
    svgParts.push(`<path d="${d}" fill="none" stroke="#e11d48" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const f of input.findings) {
    const p = project(f.lat, f.lon);
    svgParts.push(
      `<g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})"><path d="M0 0 C-4 -9 -14 -14 -14 -24 A14 14 0 1 1 14 -24 C14 -14 4 -9 0 0Z" fill="${PRIORITY_COLORS[f.priority]}" stroke="#fff" stroke-width="3"/><text x="0" y="-19" text-anchor="middle" font-family="Helvetica, Arial" font-size="16" font-weight="700" fill="#fff">${f.nr ?? "!"}</text></g>`,
    );
  }
  for (const ph of input.photos) {
    const p = project(ph.lat, ph.lon);
    svgParts.push(
      `<g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})"><circle r="15" fill="#0f4c81" stroke="#fff" stroke-width="3"/><text y="5.5" text-anchor="middle" font-family="Helvetica, Arial" font-size="${ph.nr && ph.nr > 99 ? 11 : 14}" font-weight="700" fill="#fff">${ph.nr ?? ""}</text></g>`,
    );
  }
  if (input.site) {
    const p = project(input.site.lat, input.site.lon);
    svgParts.push(
      `<g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})"><path d="M0 0 C-6 -12 -20 -20 -20 -34 A20 20 0 1 1 20 -34 C20 -20 6 -12 0 0Z" fill="#0f4c81" stroke="#fff" stroke-width="4"/><circle cy="-34" r="7" fill="#fff"/></g>`,
    );
  }
  // Scale bar (metres per pixel at the centre latitude).
  const centerLat = (minLat + maxLat) / 2;
  const mpp = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / 2 ** z;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((m) => m / mpp >= 120) ?? 5000;
  const barPx = nice / mpp;
  svgParts.push(
    `<g transform="translate(24,${height - 30})"><rect x="-8" y="-24" width="${barPx + 70}" height="38" fill="#fff" opacity="0.85" rx="4"/><rect width="${barPx.toFixed(1)}" height="6" fill="#111"/><text x="${(barPx + 8).toFixed(1)}" y="6" font-family="Helvetica, Arial" font-size="15" fill="#111">${nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</text></g>`,
  );
  svgParts.push(
    `<g transform="translate(${width - 50},40)"><circle r="22" fill="#fff" opacity="0.85"/><path d="M0 -16 L7 6 L0 2 L-7 6Z" fill="#111"/><text y="17" text-anchor="middle" font-family="Helvetica" font-size="11" fill="#111">N</text></g>`,
  );
  svgParts.push(`<text x="${width - 10}" y="${height - 8}" text-anchor="end" font-family="Helvetica" font-size="13" fill="#333">Achtergrond © Kadaster / PDOK (BRT)</text>`);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgParts.join("")}</svg>`);

  return sharp({ create: { width, height, channels: 3, background: "#eef1f4" } })
    .composite([...tiles, { input: svg, left: 0, top: 0 }])
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/**
 * Markers for an inspection's overview map: route inspections show numbered
 * photos, findings and the GPS track; location inspections one pin on the site.
 */
export function overviewMapInput(ctx: InspectionContext, findingNr: (id: string, index: number) => number | null | undefined = (_id, i) => i + 1): Pick<StaticMapInput, "photos" | "findings" | "track" | "extraPoints" | "site"> {
  if (!ctx.template.tracksRoute) {
    return { photos: [], findings: [], track: null, site: inspectionSite(ctx.inspection, ctx.captures) };
  }
  const located = ctx.findings.filter((f) => f.lat !== null);
  return {
    photos: ctx.captures.filter((c) => c.lat !== null && ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport).map((c) => ({ lat: c.lat!, lon: c.lon!, nr: c.seq })),
    findings: located.map((f, i) => ({ lat: f.lat!, lon: f.lon!, priority: f.priority, nr: findingNr(f.id, i) })),
    track: ctx.track?.lineGeojson ?? null,
    extraPoints: ctx.inspection.lat !== null && ctx.inspection.lon !== null ? [{ lat: ctx.inspection.lat, lon: ctx.inspection.lon }] : [],
  };
}

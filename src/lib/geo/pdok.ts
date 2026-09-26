/**
 * PDOK services (no API key required).
 * - Locatieserver v3.1: https://api.pdok.nl/bzk/locatieserver/search/v3_1/
 * - BRT-Achtergrondkaart WMTS: https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0
 * - Luchtfoto (HWH) WMTS: https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0
 */

export const PDOK_TILES = {
  brt: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
  brtGrijs: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png",
  luchtfoto: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg",
} as const;
export const PDOK_ATTRIBUTION = "Kaartgegevens © Kadaster / PDOK";
export const PDOK_MAX_ZOOM = { brt: 19, luchtfoto: 21 } as const;

const LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";

export type ReverseGeocodeResult = {
  address: string;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  municipality: string | null;
  distanceM: number | null;
  bagId: string | null;
};

type LocatieserverDoc = {
  weergavenaam?: string;
  straatnaam?: string;
  huis_nlt?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  gemeentenaam?: string;
  afstand?: number;
  nummeraanduiding_id?: string;
};

/** Nearest BAG address for a coordinate. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ReverseGeocodeResult | null> {
  const url = new URL(`${LOCATIESERVER}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("type", "adres");
  url.searchParams.set("rows", "1");
  url.searchParams.set("fl", "weergavenaam,straatnaam,huis_nlt,postcode,woonplaatsnaam,gemeentenaam,afstand,nummeraanduiding_id");
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { docs?: LocatieserverDoc[] } };
    const doc = data.response?.docs?.[0];
    if (!doc?.weergavenaam) return null;
    return {
      address: doc.weergavenaam,
      street: doc.straatnaam ?? null,
      houseNumber: doc.huis_nlt ?? null,
      postcode: doc.postcode ?? null,
      city: doc.woonplaatsnaam ?? null,
      municipality: doc.gemeentenaam ?? null,
      distanceM: typeof doc.afstand === "number" ? doc.afstand : null,
      bagId: doc.nummeraanduiding_id ?? null,
    };
  } catch {
    return null;
  }
}

export type SuggestResult = { id: string; label: string; type: string };

/** Free-text search (for addresses/places) — used by the map search box. */
export async function suggest(query: string, fetchImpl: typeof fetch = fetch): Promise<SuggestResult[]> {
  const url = new URL(`${LOCATIESERVER}/suggest`);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", "8");
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: { docs?: { id: string; weergavenaam: string; type: string }[] } };
    return (data.response?.docs ?? []).map((d) => ({ id: d.id, label: d.weergavenaam, type: d.type }));
  } catch {
    return [];
  }
}

/** Resolve a suggest id to a coordinate. */
export async function lookup(id: string, fetchImpl: typeof fetch = fetch): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = new URL(`${LOCATIESERVER}/lookup`);
  url.searchParams.set("id", id);
  url.searchParams.set("fl", "weergavenaam,centroide_ll");
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { docs?: { weergavenaam: string; centroide_ll: string }[] } };
    const doc = data.response?.docs?.[0];
    const m = doc?.centroide_ll.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!doc || !m) return null;
    return { lon: Number(m[1]), lat: Number(m[2]), label: doc.weergavenaam };
  } catch {
    return null;
  }
}

// --- Web-mercator tile math (used for tile pre-caching and static maps) ----
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}
export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

/** All tile URLs covering a bbox for the given zoom range. */
export function tilesForBbox(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  template: string,
  maxTiles = 4000,
): string[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const urls: string[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = Math.floor(lonToTileX(minLon, z));
    const x1 = Math.floor(lonToTileX(maxLon, z));
    const y0 = Math.floor(latToTileY(maxLat, z));
    const y1 = Math.floor(latToTileY(minLat, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        urls.push(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
        if (urls.length >= maxTiles) return urls;
      }
    }
  }
  return urls;
}

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { rdToWgs84 } from "./rd";

/**
 * Minimal IMKL (KLIC-levering) parser. A KLIC delivery is a ZIP containing a
 * GML file with utility networks (Utiliteitsnet), utility links
 * (UtilityLink with a centreline geometry in EPSG:28992) and network
 * elements (cables/pipes) that reference those links. We turn this into a
 * WGS84 GeoJSON FeatureCollection for display on the map.
 */

export type KlicFeatureProps = {
  id: string;
  elementType: string;
  thema: string;
  netbeheerder: string | null;
  label: string | null;
  color: string;
};
export type KlicFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString, KlicFeatureProps>;

export const KLIC_THEME_COLORS: Record<string, string> = {
  hoogspanning: "#ff0000",
  middenspanning: "#00b400",
  laagspanning: "#8b4513",
  landelijkHoogspanningsnet: "#ff0000",
  gasHogeDruk: "#ffd750",
  gasLageDruk: "#ffd750",
  water: "#0000ff",
  rioolVrijverval: "#aa00aa",
  rioolOnderOverOfOnderdruk: "#aa00aa",
  datatransport: "#00ff00",
  warmte: "#ff8000",
  buisleidingGevaarlijkeInhoud: "#ff6600",
  petrochemie: "#ff6600",
  wees: "#555555",
  overig: "#555555",
};

export function klicColor(thema: string): string {
  return KLIC_THEME_COLORS[thema] ?? "#555555";
}

type XmlNode = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function hrefTail(v: unknown): string | null {
  if (!v) return null;
  const node = v as XmlNode;
  const href = (node["@_href"] ?? node["@_xlink:href"]) as string | undefined;
  if (!href) return null;
  const tail = href.split(/[/#]/).pop();
  return tail ?? null;
}

function gmlId(node: XmlNode): string | null {
  const id = (node["@_id"] ?? node["@_gml:id"]) as string | undefined;
  if (id) return id;
  const ident = node["identificatie"] as XmlNode | undefined;
  const nen = ident?.["NEN3610ID"] as XmlNode | undefined;
  if (nen) return `${nen["namespace"] ?? ""}${nen["lokaalID"] ?? ""}` || null;
  return null;
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in (v as XmlNode)) return String((v as XmlNode)["#text"]);
  return "";
}

/** Parse a gml:posList (x y x y ... in RD) into WGS84 [lon, lat] pairs. */
export function parsePosList(posList: string, dimension = 2): [number, number][] {
  const nums = posList
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const coords: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += dimension) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    // RD coordinates are metres (x ~ 0–300k, y ~ 300k–625k); otherwise assume lon/lat already.
    if (x > 1000 && y > 1000) {
      const { lat, lon } = rdToWgs84(x, y);
      coords.push([round6(lon), round6(lat)]);
    } else {
      coords.push([round6(y), round6(x)]);
    }
  }
  return coords;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

/** Recursively find all LineString posLists below a node. */
function findLineStrings(node: unknown, out: [number, number][][] = []): [number, number][][] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findLineStrings(n, out));
    return out;
  }
  const obj = node as XmlNode;
  for (const [key, value] of Object.entries(obj)) {
    if (key === "LineString" || key === "LineStringSegment") {
      for (const ls of asArray(value as XmlNode | XmlNode[])) {
        const pos = textOf(ls["posList"]);
        if (pos) {
          const dim = Number((ls["posList"] as XmlNode | undefined)?.["@_srsDimension"] ?? ls["@_srsDimension"] ?? 2);
          const coords = parsePosList(pos, dim === 3 ? 3 : 2);
          if (coords.length >= 2) out.push(coords);
        }
      }
    } else if (typeof value === "object") {
      findLineStrings(value, out);
    }
  }
  return out;
}

const NETWORK_ELEMENT_HINTS = [
  "ElectricityCable",
  "TelecommunicationsCable",
  "WaterPipe",
  "SewerPipe",
  "OilGasChemicalsPipe",
  "ThermalPipe",
  "Kabelbed",
  "Mantelbuis",
  "Duct",
  "Pipe",
  "Cable",
  "OlieGasChemicalienPijpleiding",
];

export function parseImklXml(xml: string): KlicFeatureCollection {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
  });
  const doc = parser.parse(xml) as XmlNode;
  const root = (Object.entries(doc).find(([k, v]) => !k.startsWith("?") && typeof v === "object")?.[1] ?? {}) as XmlNode;
  const members: [string, XmlNode][] = [];
  for (const key of ["featureMember", "member", "featureMembers"]) {
    for (const m of asArray(root[key] as XmlNode | XmlNode[])) {
      for (const [name, value] of Object.entries(m)) {
        if (name.startsWith("@_")) continue;
        for (const el of asArray(value as XmlNode | XmlNode[])) members.push([name, el]);
      }
    }
  }

  const networks = new Map<string, { thema: string; netbeheerder: string | null }>();
  const links = new Map<string, [number, number][][]>();
  for (const [name, el] of members) {
    const id = gmlId(el);
    if (!id) continue;
    if (name === "Utiliteitsnet") {
      const thema = hrefTail(el["thema"]) ?? textOf(el["thema"]) ?? "overig";
      const beheerder = textOf(el["authorityRole"]) || textOf((el["authority"] as XmlNode | undefined)?.["@_title"]) || null;
      networks.set(id, { thema: thema || "overig", netbeheerder: beheerder });
    } else if (name === "UtilityLink" || name === "UtilityLinkSequence") {
      links.set(id, findLineStrings(el));
    }
  }

  const features: KlicFeatureCollection["features"] = [];
  const usedLinks = new Set<string>();
  for (const [name, el] of members) {
    if (!NETWORK_ELEMENT_HINTS.some((h) => name.includes(h))) continue;
    const id = gmlId(el) ?? `${name}-${features.length}`;
    const networkId = hrefTail(el["inNetwork"]);
    const network = networkId
      ? [...networks.entries()].find(([k]) => k.endsWith(networkId) || networkId.endsWith(k))?.[1]
      : undefined;
    const linkRefs = asArray(el["link"] as XmlNode | XmlNode[])
      .map(hrefTail)
      .filter((v): v is string => Boolean(v));
    const lines: [number, number][][] = [];
    for (const ref of linkRefs) {
      for (const [k, v] of links) {
        if (k.endsWith(ref) || ref.endsWith(k)) {
          lines.push(...v);
          usedLinks.add(k);
        }
      }
    }
    lines.push(...findLineStrings(el));
    if (lines.length === 0) continue;
    const thema = network?.thema ?? "overig";
    features.push({
      type: "Feature",
      geometry: lines.length === 1 ? { type: "LineString", coordinates: lines[0]! } : { type: "MultiLineString", coordinates: lines },
      properties: {
        id,
        elementType: name,
        thema,
        netbeheerder: network?.netbeheerder ?? null,
        label: textOf(el["label"]) || textOf(el["name"]) || null,
        color: klicColor(thema),
      },
    });
  }

  // Links that no element referenced are still useful to show.
  for (const [id, lines] of links) {
    if (usedLinks.has(id) || lines.length === 0) continue;
    features.push({
      type: "Feature",
      geometry: lines.length === 1 ? { type: "LineString", coordinates: lines[0]! } : { type: "MultiLineString", coordinates: lines },
      properties: { id, elementType: "UtilityLink", thema: "overig", netbeheerder: null, label: null, color: klicColor("overig") },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Parse a KLIC delivery (ZIP or GML/XML) into GeoJSON. */
export async function parseKlicDelivery(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<{ collection: KlicFeatureCollection; meldingnummer: string | null }> {
  const lower = fileName.toLowerCase();
  let xmlFiles: { name: string; text: string }[] = [];
  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files).filter((f) => !f.dir && /\.(xml|gml)$/i.test(f.name));
    xmlFiles = await Promise.all(entries.map(async (f) => ({ name: f.name, text: await f.async("string") })));
  } else {
    xmlFiles = [{ name: fileName, text: new TextDecoder().decode(data) }];
  }
  const all: KlicFeatureCollection = { type: "FeatureCollection", features: [] };
  let meldingnummer: string | null = null;
  for (const f of xmlFiles) {
    const m = f.name.match(/(\d{2}[OG]\d{6,})/) ?? f.text.match(/<[^>]*klicMeldnummer>([^<]+)</);
    if (m && !meldingnummer) meldingnummer = m[1] ?? null;
    if (!/LineString|posList/.test(f.text)) continue;
    all.features.push(...parseImklXml(f.text).features);
  }
  return { collection: all, meldingnummer };
}

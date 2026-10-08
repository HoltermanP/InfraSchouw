import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  actions,
  billingEvidence,
  billingItems,
  captures,
  inspectionParticipants,
  inspections,
  klicImports,
  measurements,
  projectMembers,
  projects,
  shareLinks,
  stationExpectedConfigs,
  stations,
  users,
  type Station,
} from "../../src/db/schema";
import type { OrgCtx } from "../../src/db/scope";
import { getTemplatesFull, ensureStandardTemplates } from "../../src/db/queries/templates";
import type { CaptureAnalysis } from "../../src/lib/ai/schemas";
import { wgs84ToRd } from "../../src/lib/geo/rd";
import { parseImklXml } from "../../src/lib/geo/klic";
import { storageMode } from "../../src/lib/storage";
import { expectedStationConfigSchema, emptyStationDescription, stationDescriptionSchema } from "../../src/lib/station/schema";
import { applyManualEdit, mergeAiDescription } from "../../src/lib/station/merge";
import { runAsbuiltCheck, saveStationDescription } from "../../src/lib/station/service";
import { generateToken, hashToken } from "../../src/lib/share";
import { DEMO_BILLING_ITEMS, DEMO_STATIONS } from "./demo";
import {
  ROUTE,
  analysis,
  answerAll,
  insertCaptures,
  insertFindings,
  insertTrack,
  insertTranscript,
  interpolate,
  makeReport,
  trackPoints,
  type CaptureSpec,
  type LatLon,
} from "./demo-inspections";

/**
 * Showcase data for a demo in a real (Clerk) organisation: one project with two
 * MS-stations and five complete inspections (2× tracé, 2× stationsoplevering,
 * 1× opleveringsschouw tracé). Additive and idempotent: only the showcase
 * project and its stations are replaced on a re-run; nothing else in the
 * organisation is touched.
 */

export const SHOWCASE_PROJECT_NUMBER = "P-2026-014";

/**
 * Second route: 10 kV cable to the new solar park along the Hasselterweg (Zwolle-Noord),
 * in the south-eastern verge. Traced from OpenStreetMap, offset 9 m into the verge.
 */
export const ROUTE_HASSELT: LatLon[] = [
  [52.542146, 6.032595], [52.542814, 6.032626], [52.54321, 6.032658], [52.543413, 6.032685], [52.543693, 6.032749],
  [52.543899, 6.032817], [52.544034, 6.032875], [52.544198, 6.032962], [52.544364, 6.033067], [52.5445, 6.033167],
  [52.544713, 6.03335], [52.54487, 6.033508], [52.545017, 6.033676], [52.545185, 6.033898], [52.54531, 6.034081],
  [52.54551, 6.034427], [52.54563, 6.034664], [52.545732, 6.0349], [52.545828, 6.035135], [52.545978, 6.035557],
  [52.5461, 6.035935], [52.546273, 6.036519], [52.546764, 6.038281], [52.547428, 6.040665], [52.548025, 6.042794],
  [52.548727, 6.045316], [52.550312, 6.051005], [52.551594, 6.055601],
];

const SHOWCASE_AREA: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [6.025, 52.516],
      [6.072, 52.516],
      [6.072, 52.556],
      [6.025, 52.556],
      [6.025, 52.516],
    ],
  ],
};

const weather = (start: Date, w: { t: number; p: number; wind: number; dir: number; hum: number; code: number; desc: string }) => ({
  temperatureC: w.t,
  precipitationMm: w.p,
  windSpeedKmh: w.wind,
  windDirectionDeg: w.dir,
  humidity: w.hum,
  weatherCode: w.code,
  description: w.desc,
  observedAt: start.toISOString(),
  source: "open-meteo" as const,
});

/** KLIC delivery (IMKL) with MS, gas, water and telecom running parallel to the given routes. */
function klicGml(meldingnummer: string, routes: LatLon[][]) {
  const toRd = (p: LatLon, dx = 0, dy = 0) => {
    const r = wgs84ToRd(p[0], p[1]);
    return `${(r.x + dx).toFixed(2)} ${(r.y + dy).toFixed(2)}`;
  };
  const pre = `nl.imkl-KL${meldingnummer}`;
  const line = (id: string, route: LatLon[], dx: number, dy: number) =>
    `<gml:featureMember><us-net-common:UtilityLink gml:id="${pre}.${id}"><net:centrelineGeometry><gml:LineString gml:id="ls-${id}" srsName="urn:ogc:def:crs:EPSG::28992"><gml:posList>${route.map((p) => toRd(p, dx, dy)).join(" ")}</gml:posList></gml:LineString></net:centrelineGeometry></us-net-common:UtilityLink></gml:featureMember>`;
  const net = (id: string, thema: string, who: string) =>
    `<gml:featureMember><imkl:Utiliteitsnet gml:id="${pre}.${id}"><imkl:thema xlink:href="http://definities.geostandaarden.nl/imkl2015/id/waarde/Thema/${thema}"/><us-net-common:authorityRole>${who}</us-net-common:authorityRole></imkl:Utiliteitsnet></gml:featureMember>`;
  const el = (tag: string, id: string, link: string, netId: string) =>
    `<gml:featureMember><${tag} gml:id="${pre}.${id}"><net:link xlink:href="${pre}.${link}"/><net:inNetwork xlink:href="${pre}.${netId}"/></${tag}></gml:featureMember>`;
  const nets = [
    { key: "ms", thema: "middenspanning", who: "Enexis Netbeheer", tag: "us-net-el:ElectricityCable", dx: 0, dy: 0 },
    { key: "gas", thema: "gasLageDruk", who: "Enexis Netbeheer", tag: "us-net-ogc:OilGasChemicalsPipe", dx: 3.5, dy: 2.5 },
    { key: "water", thema: "water", who: "Vitens", tag: "us-net-wa:WaterPipe", dx: -4, dy: -3 },
    { key: "data", thema: "datatransport", who: "KPN", tag: "us-net-common:TelecommunicationsCable", dx: 1.5, dy: -1.5 },
  ];
  const features = nets.flatMap((n) => [
    net(`net-${n.key}`, n.thema, n.who),
    ...routes.flatMap((r, i) => [line(`link-${n.key}-${i}`, r, n.dx, n.dy), el(n.tag, `c-${n.key}-${i}`, `link-${n.key}-${i}`, `net-${n.key}`)]),
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?><gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:imkl="http://www.geostandaarden.nl/imkl/wibon" xmlns:us-net-common="http://inspire.ec.europa.eu/schemas/us-net-common/4.0" xmlns:us-net-el="http://inspire.ec.europa.eu/schemas/us-net-el/4.0" xmlns:us-net-wa="http://inspire.ec.europa.eu/schemas/us-net-wa/4.0" xmlns:us-net-ogc="http://inspire.ec.europa.eu/schemas/us-net-ogc/4.0" xmlns:net="http://inspire.ec.europa.eu/schemas/net/4.0" xmlns:xlink="http://www.w3.org/1999/xlink">${features.join("")}</gml:FeatureCollection>`;
}

/** Remove a previous showcase run (project, its inspections and the showcase stations) in this org only. */
export async function clearShowcase(orgId: string) {
  const [project] = await db.select().from(projects).where(and(eq(projects.orgId, orgId), eq(projects.number, SHOWCASE_PROJECT_NUMBER))).limit(1);
  if (project) {
    const insp = await db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.orgId, orgId), eq(inspections.projectId, project.id)));
    const ids = insp.map((i) => i.id);
    if (ids.length) {
      await db.delete(captures).where(and(eq(captures.orgId, orgId), inArray(captures.inspectionId, ids)));
      await db.delete(inspections).where(and(eq(inspections.orgId, orgId), inArray(inspections.id, ids)));
    }
    await db.delete(projects).where(eq(projects.id, project.id));
  }
  await db.delete(stations).where(and(eq(stations.orgId, orgId), inArray(stations.code, DEMO_STATIONS.map((s) => s.code))));
}

type Ctx = { org: { id: string }; user: { id: string; name: string }; ctx: OrgCtx; finalize: boolean };

export async function seedShowcase(orgId: string, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`Gebruiker ${userId} niet gevonden.`);
  await ensureStandardTemplates(orgId, db, userId);
  await clearShowcase(orgId);
  const c: Ctx = { org: { id: orgId }, user: { id: user.id, name: user.name }, ctx: { orgId, userId: user.id, role: "admin" }, finalize: storageMode() === "blob" };

  const [project] = await db
    .insert(projects)
    .values({
      orgId,
      number: SHOWCASE_PROJECT_NUMBER,
      name: "Netverzwaring Zwolle-Noord – 10 kV",
      client: "Enexis Netbeheer",
      contractForm: "UAV-GC",
      phase: "uitvoering",
      status: "actief",
      description:
        "Verzwaring van het 10 kV-net in Zwolle-Noord. Fase 1: nieuwe MS-ring van circa 1,2 km tussen twee nieuwe compacte MS-stations in Stadshagen (Frankhuizerallee en Werkerlaan), inclusief gestuurde boringen onder de watergang en de Oude Wetering. Fase 2: 10 kV-aansluiting van zonnepark Hasselterweg (circa 2 km kabel in de berm van de Hasselterweg).",
      areaGeojson: SHOWCASE_AREA,
      createdBy: user.id,
    })
    .returning();
  await db.insert(projectMembers).values({ orgId, projectId: project!.id, userId: user.id, projectRole: "projectleider", createdBy: user.id }).onConflictDoNothing();
  await db.insert(billingItems).values(DEMO_BILLING_ITEMS.map((b, i) => ({ ...b, orgId, projectId: project!.id, sort: i, createdBy: user.id })));
  const stationRows: Station[] = [];
  for (const s of DEMO_STATIONS) {
    const { expected, ...rest } = s;
    const [station] = await db.insert(stations).values({ ...rest, orgId, projectId: project!.id, createdBy: user.id }).returning();
    await db.insert(stationExpectedConfigs).values({ orgId, stationId: station!.id, config: expectedStationConfigSchema.parse(expected), source: "import", createdBy: user.id });
    stationRows.push(station!);
  }
  await db.insert(klicImports).values([
    { orgId, projectId: project!.id, name: "Levering_26O0457812.zip", meldingnummer: "26O0457812", featureCount: 8, geojson: parseImklXml(klicGml("26O0457812", [ROUTE])), createdBy: user.id },
    { orgId, projectId: project!.id, name: "Levering_26O0613390.zip", meldingnummer: "26O0613390", featureCount: 8, geojson: parseImklXml(klicGml("26O0613390", [ROUTE_HASSELT])), createdBy: user.id },
  ]);

  const summary: string[] = [`Project ${project!.number} "${project!.name}" met ${DEMO_BILLING_ITEMS.length} afrekenposten, 2 MS-stations en 2 KLIC-leveringen.`];
  const st = (code: string) => stationRows.find((s) => s.code === code)!;
  summary.push(await traceStadshagen(c, project!.id));
  summary.push(await traceHasselterweg(c, project!.id));
  summary.push(await stationOplevering4012(c, project!.id, st("ZWL-STH-4012")));
  summary.push(await stationOplevering4013(c, project!.id, st("ZWL-STH-4013")));
  summary.push(await opleveringTrace(c, project!.id));
  if (!c.finalize) summary.push("Let op: geen BLOB_READ_WRITE_TOKEN — het tracéverslag Stadshagen staat op 'ter review' (definitief maken archiveert de PDF in productie-opslag).");
  return summary;
}

async function templates(orgId: string) {
  const all = await getTemplatesFull({ orgId, userId: null, role: "admin" });
  return (key: string) => all.find((t) => t.key === key)!;
}

async function participants(c: Ctx, inspectionId: string, at: Date, people: { name: string; organization: string; role: string; sig: 1 | 2 | 3 }[]) {
  await db.insert(inspectionParticipants).values(
    people.map((p) => ({ orgId: c.org.id, inspectionId, name: p.name, organization: p.organization, role: p.role, signatureUrl: `static:/demo/signature-${p.sig}.png`, signedAt: at, createdBy: c.user.id })),
  );
}

const plain = (findings: string[]) =>
  findings.map((id) => ({ id, title: "", description: "", location: null, priority: "midden" as const, category: "kwaliteit" as const, capture_ids: [], recommendation: "" }));

// ---------------------------------------------------------------------------------------------
// 1. Tracéschouw MS-ring Stadshagen (ontwerpfase) — definitief (of ter review) met deellink
// ---------------------------------------------------------------------------------------------
async function traceStadshagen(c: Ctx, projectId: string) {
  const tpl = await templates(c.org.id);
  const t = tpl("trace");
  const start = new Date("2026-06-10T07:15:00Z");
  const [insp] = await db
    .insert(inspections)
    .values({
      orgId: c.org.id,
      projectId,
      templateId: t.id,
      inspectorId: c.user.id,
      title: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan",
      status: "verwerkt",
      startedAt: start,
      endedAt: new Date(start.getTime() + 105 * 60_000),
      weather: weather(start, { t: 16.8, p: 0, wind: 12, dir: 240, hum: 70, code: 2, desc: "Half bewolkt" }),
      address: "Frankhuizerallee 120, 8043 XB Zwolle",
      lat: ROUTE[0]![0],
      lon: ROUTE[0]![1],
      deviceInfo: { userAgent: "iPhone 16 Pro (Safari)", platform: "iOS", screen: "402x874" },
      notes: "Tracé volledig gelopen met de uitvoerder van Grondwerk Oost en de groenbeheerder van de gemeente. Boorlocaties bij de watergang en de Oude Wetering nog afstemmen met het waterschap.",
      createdBy: c.user.id,
    })
    .returning();
  await insertTrack(c.ctx, insp!.id, trackPoints(ROUTE, start, 100, 11));
  const at = (f: number) => interpolate(ROUTE, f);
  const caps = await insertCaptures(c.ctx, insp!.id, start, t, [
    /* 0 */ { key: "trace-01-start", at: 3, pos: at(0.02), heading: 110, shot: "Beginpunt", analysis: analysis("Beginpunt van het tracé bij de toekomstige stationslocatie ZWL-STH-4012 aan de Frankhuizerallee.", "Straatbeeld met vrijliggend fietspad, fietsenstalling en nieuwbouwwoningen. Het tracé start in de brede grasberm naast het fietspad. In de eerste 20 m geen obstakels; lantaarnpaal op circa 3 m uit de tracélijn.", ["tracé", "berm", "beginpunt"], { detected_objects: ["fietspad", "lantaarnpaal", "grasberm"] }) },
    /* 1 */ { key: "trace-02-bomen", at: 12, pos: at(0.12), heading: 95, shot: "Bomen", tags: ["boom"], analysis: analysis("Bomenrij (linde) direct langs het beoogde tracé.", "Twee volgroeide lindes op circa 1 m van de indicatieve tracélijn, stamdiameter circa 45 cm. De kroonprojectie reikt over het tracé; bij open ontgraving is wortelschade waarschijnlijk.", ["boom", "kroonprojectie", "berm"], { possible_findings: [{ category: "omgeving", description: "Tracé binnen kroonprojectie van twee lindes", priority: "hoog", confidence: 0.82 }] }) },
    /* 2 */ { key: "trace-08-berm", at: 19, pos: at(0.2), heading: 300, tags: ["berm"], analysis: analysis("Brede grasberm tussen rijbaan en trottoir.", "Grasberm van circa 3 m breed zonder zichtbare obstakels of kolken; geschikt voor open ontgraving met een minigraver.", ["berm", "gras"]) },
    /* 3 */ { key: "trace-05-boorlocatie", at: 26, pos: at(0.27), heading: 20, shot: "Mogelijke boorlocatie", tags: ["boorlocatie"], analysis: analysis("Beoogd intredepunt voor de gestuurde boring onder de watergang.", "Verharde strook met voldoende ruimte (circa 12 × 6 m) voor een compacte boorstelling. Bereikbaar vanaf de rijbaan; geen bovengrondse obstakels.", ["boring", "boorlocatie"]) },
    /* 4 */ { key: "trace-06-sloot", at: 29, pos: at(0.3), heading: 30, tags: ["watergang"], analysis: analysis("Watergang die met een gestuurde boring gekruist moet worden.", "Watergang van circa 8 m breed met natuurlijke oevers en riet. Kruising vereist een watervergunning en een boring met voldoende dekking onder de waterbodem.", ["watergang", "boring", "vergunning"], { possible_findings: [{ category: "vergunning", description: "Watervergunning waterschap nodig voor kruising watergang", priority: "midden", confidence: 0.86 }] }) },
    /* 5 */ { key: "trace-03-kruising", at: 37, pos: at(0.375), heading: 45, shot: "Kruising", tags: ["kruising"], analysis: analysis("Kruising Frankhuizerallee / Binnendijkstraat met voetgangersoversteek.", "Viersprong met asfaltverharding, voetgangersoversteek en verkeerslichten-loze voorrangsregeling. Het kruisen van de rijbaan vraagt een verkeersmaatregel of een korte gestuurde boring.", ["kruising", "asfalt", "verkeer"], { possible_findings: [{ category: "veiligheid", description: "Kruising rijbaan vraagt verkeersmaatregel", priority: "midden", confidence: 0.7 }] }) },
    /* 6 */ { key: "trace-04-klinkers", at: 44, pos: at(0.45), heading: 35, tags: ["verharding"], analysis: analysis("Klinkerverharding van het trottoir langs het tracé.", "Gebakken klinkers in keperverband, in goede staat; lokaal lichte spoorvorming bij inritten. Herstel na ontgraving in hetzelfde verband en dezelfde kleur.", ["klinkers", "verharding"]) },
    /* 7 */ { key: "trace-09-oprit", at: 49, pos: at(0.51), heading: 125, tags: ["bereikbaarheid"], analysis: analysis("Inritten van woningen aan de Binnendijkstraat.", "Drie woninginritten op het tracé. Tijdens uitvoering moet de bereikbaarheid voor bewoners gegarandeerd blijven (rijplaten of gefaseerde uitvoering).", ["inrit", "bereikbaarheid", "BLVC"], { privacy_flags: { persons_recognizable: false, license_plates_visible: true, notes: "Geparkeerde auto met leesbaar kenteken op de achtergrond" } }) },
    /* 8 */ { key: "trace-07-sleuf", at: 58, pos: at(0.6), heading: 120, tags: ["proefsleuf"], analysis: analysis("Proefsleuf met drie bestaande kabels.", "Proefsleuf van circa 1 m diep. Zichtbaar: MS-kabel in gele mantelbuis, bundel telecombuizen en een LS-kabel. Bovenkant MS-kabel op circa 70 cm onder maaiveld.", ["proefsleuf", "kabels", "diepte"], { possible_findings: [{ category: "techniek", description: "Bestaande kabels in het beoogde tracé", priority: "midden", confidence: 0.72 }] }) },
    /* 9 */ { key: "trace-10-eind", at: 98, pos: at(0.99), heading: 110, shot: "Eindpunt", analysis: analysis("Eindpunt van het tracé bij de stationslocatie ZWL-STH-4013 aan de Werkerlaan.", "Stationslocatie in de groenstrook naast de Werkerlaan, bij een bestaande kabelverdeelkast. Kabelinvoerzijde vrij bereikbaar.", ["station", "eindpunt"]) },
    /* 10 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 95_000, at: 11, pos: at(0.11) },
    /* 11 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 60_000, at: 57, pos: at(0.6) },
    /* 12 */ { type: "note", at: 45, pos: at(0.46), text: "Aannemer: klinkers in dit deel zijn in 2019 vernieuwd; herstel in dezelfde kleur (rood/bruin gemêleerd) en in keperverband." },
    /* 13 */ { type: "note", at: 59, pos: at(0.61), text: "KLIC 26O0457812 klopt met de proefsleuf, behalve de KPN-kabel: die ligt circa 40 cm oostelijker dan getekend." },
    /* 14 */ { type: "measurement", at: 58, pos: at(0.605), text: "Diepte bovenkant bestaande MS-kabel: 72 cm" },
    /* 15 */ { type: "measurement", at: 29, pos: at(0.3), text: "Breedte watergang: 8,2 m" },
    /* 16 */ { type: "measurement", at: 13, pos: at(0.125), text: "Afstand stam tot tracé: 1,1 m" },
    /* 17 */ { type: "note", at: 70, pos: at(0.7), text: "Oude Wetering: kruising met gestuurde boring van circa 110 m oostelijk naast de voetbrug (≥ 5 m uit de brugfundering). Intree Twistvlietpad, uittree op de kade aan de noordzijde." },
  ]);
  await db.insert(measurements).values([
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[14]!, photoCaptureId: caps[8]!, kind: "diepte", label: "Diepte bovenkant bestaande MS-kabel", value: 72, unit: "cm", lat: at(0.605)[0], lon: at(0.605)[1], measuredAt: new Date(start.getTime() + 58 * 60_000), createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[15]!, photoCaptureId: caps[4]!, kind: "breedte", label: "Breedte watergang", value: 8.2, unit: "m", lat: at(0.3)[0], lon: at(0.3)[1], measuredAt: new Date(start.getTime() + 29 * 60_000), createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[16]!, photoCaptureId: caps[1]!, kind: "lengte", label: "Afstand stam linde tot tracé", value: 1.1, unit: "m", lat: at(0.125)[0], lon: at(0.125)[1], measuredAt: new Date(start.getTime() + 13 * 60_000), createdBy: c.user.id },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[10]!, new Date(start.getTime() + 11 * 60_000), [
    { from: 0, to: 14, text: "We staan bij de bomenrij aan de Frankhuizerallee. De twee lindes staan ongeveer een meter van het tracé, ik meet één komma één meter tot de stam." },
    { from: 14, to: 33, text: "De kroon hangt helemaal over het tracé. Hier moeten we handmatig graven of het tracé richting de rijbaan verleggen." },
    { from: 33, to: 60, text: "Actie voor de ontwerper: tracé ter plaatse van de bomen twee meter naar de rijbaan schuiven en een bomeneffectanalyse aanvragen bij de gemeente." },
    { from: 60, to: 95, text: "Verder is de berm hier breed genoeg, geen kolken of andere obstakels. Verharding van het trottoir is klinkers, goede staat." },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[11]!, new Date(start.getTime() + 57 * 60_000), [
    { from: 0, to: 20, text: "Proefsleuf ter hoogte van hectometer nul komma zes. Bovenkant MS-kabel op tweeënzeventig centimeter." },
    { from: 20, to: 42, text: "De KPN-kabel ligt zo'n veertig centimeter oostelijker dan op de KLIC-tekening. Dat moeten we terugmelden." },
    { from: 42, to: 60, text: "Voorstel: nieuwe kabel in dit stuk in de berm leggen, dan blijven we uit de bestaande bundel." },
  ]);
  const fIds = await insertFindings(c.ctx, insp!.id, projectId, caps, [
    { title: "Tracé binnen kroonprojectie van twee straatbomen", description: "Het tracé ligt op 1,1 m van twee volgroeide lindes; de kroonprojectie reikt over het tracé. Bij open ontgraving is wortelschade te verwachten.", category: "omgeving", priority: "hoog", captureIdx: [1, 16], recommendation: "Tracé ter plaatse 2 m richting rijbaan verleggen of handmatig ontgraven onder begeleiding van een boomdeskundige; bomeneffectanalyse (BEA) laten uitvoeren.", source: "transcript" },
    { title: "Watervergunning nodig voor kruising watergang", description: "De watergang (8,2 m breed) wordt met een gestuurde boring gekruist. Hiervoor is een watervergunning van het waterschap vereist.", category: "vergunning", priority: "midden", captureIdx: [3, 4], recommendation: "Watervergunning aanvragen bij Waterschap Drents Overijsselse Delta; boorplan met dekking ≥ 2 m onder de waterbodem opstellen." },
    { title: "Bestaande kabels in beoogd tracé / afwijking KLIC", description: "In de proefsleuf liggen MS-, LS- en telecomkabels; bovenkant MS-kabel op 72 cm. De KPN-kabel ligt circa 40 cm oostelijker dan in KLIC-melding 26O0457812.", category: "techniek", priority: "midden", captureIdx: [8, 14], recommendation: "Nieuwe kabel tussen hm 0,55 en 0,70 in de berm leggen; extra proefsleuven graven; afwijking terugmelden bij KPN via de KLIC-terugmelding." },
    { title: "Kruising Binnendijkstraat vraagt verkeersmaatregel", description: "Het tracé kruist de Binnendijkstraat ter hoogte van de voetgangersoversteek.", category: "veiligheid", priority: "midden", captureIdx: [5], recommendation: "Kruising uitvoeren met een korte gestuurde boring of halve-rijbaanafzetting conform CROW 96b; verkeersplan laten goedkeuren door de gemeente Zwolle." },
    { title: "Bereikbaarheid inritten tijdens uitvoering", description: "Drie woninginritten aan de Binnendijkstraat liggen op het tracé.", category: "planning", priority: "laag", captureIdx: [7], recommendation: "Gefaseerd uitvoeren met rijplaten; bewoners minimaal één week vooraf informeren (BLVC-plan)." },
  ]);
  await db.insert(actions).values([
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Tracé ter plaatse van de lindes 2 m richting rijbaan verschuiven en BEA aanvragen", owner: "Ontwerper", dueDate: "2026-06-24", status: "gereed", findingIds: [fIds[0]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Watervergunning aanvragen voor kruising watergang en Oude Wetering", owner: "Projectleider", dueDate: "2026-07-01", status: "gereed", findingIds: [fIds[1]!], source: "handmatig", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Afwijking KPN-kabel terugmelden (KLIC-terugmelding)", owner: "Aannemer", dueDate: "2026-06-17", status: "gereed", findingIds: [fIds[2]!], source: "handmatig", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Verkeersplan kruising Binnendijkstraat ter goedkeuring indienen bij gemeente Zwolle", owner: "Aannemer", dueDate: "2026-07-08", status: "gereed", findingIds: [fIds[3]!], source: "ai", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Bewonersbrief Binnendijkstraat opstellen en verspreiden", owner: "Omgevingsmanager", dueDate: "2026-08-15", status: "gereed", findingIds: [fIds[4]!], source: "handmatig", createdBy: c.user.id },
  ]);
  await answerAll(c.ctx, insp!.id, t, {
    0: { value: "ja" },
    1: { value: 3, note: "Watergang Frankhuizerallee, Binnendijkstraat en Oude Wetering" },
    2: { value: "ja", note: "Twee lindes op 1,1 m", caps: [caps[1]!] },
    3: { value: "ja", note: "Intree bij watergang en op het Twistvlietpad" },
    4: { value: "Gemengd", note: "Grasberm, klinkers (trottoir) en asfalt (kruisingen)" },
    5: { value: "ja" },
    6: { value: "ja", note: "Waterschap (watervergunning) en gemeente (verkeersbesluit, BEA)" },
    7: { value: "ja", note: "Afwijking KPN-kabel van circa 40 cm" },
    8: { value: "De bomen aan de Frankhuizerallee en de twee waterkruisingen zijn de belangrijkste knelpunten. Met de voorgestelde tracéaanpassing is het tracé goed uitvoerbaar." },
  }, new Date(start.getTime() + 100 * 60_000));
  await participants(c, insp!.id, new Date(start.getTime() + 104 * 60_000), [
    { name: c.user.name, organization: "Toezicht & advies", role: "Toezichthouder", sig: 1 },
    { name: "Mark de Boer", organization: "Grondwerk Oost BV", role: "Uitvoerder aannemer", sig: 2 },
    { name: "Ilse Brink", organization: "Gemeente Zwolle", role: "Groenbeheerder", sig: 3 },
  ]);
  const status = c.finalize ? "definitief" : "ter_review";
  const report = await makeReport(
    c.ctx,
    insp!.id,
    (cp, f) => ({
      title: "Schouwverslag tracé MS-ring Frankhuizerallee – Werkerlaan",
      summary:
        "Op 10 juni 2026 is het voorgenomen MS-tracé tussen de nieuwe stations ZWL-STH-4012 (Frankhuizerallee) en ZWL-STH-4013 (Werkerlaan) over circa 1,2 km gelopen, samen met de aannemer en de groenbeheerder van de gemeente.\n\nHet tracé is goed uitvoerbaar in de grasberm en onder de klinkerverharding van het trottoir. Vier punten vragen aandacht vóór het definitief ontwerp: (1) het tracé ligt binnen de kroonprojectie van twee lindes, (2) de watergang en de Oude Wetering worden met een gestuurde boring gekruist, waarvoor een watervergunning nodig is, (3) in de proefsleuf liggen bestaande kabels op 72 cm diepte en de KPN-kabel wijkt af van de KLIC-melding, en (4) de kruising met de Binnendijkstraat vraagt een verkeersmaatregel. Alle acties zijn inmiddels afgerond.",
      key_points: [
        { title: "Bomen binnen kroonprojectie", description: "Tracé 2 m verlegd; BEA uitgevoerd.", priority: "hoog", category: "omgeving", finding_ids: ["0"], capture_ids: [cp[1]!] },
        { title: "Watervergunning voor boringen", description: "Twee gestuurde boringen; vergunning waterschap.", priority: "midden", category: "vergunning", finding_ids: ["1"], capture_ids: [cp[4]!] },
        { title: "Kabels in tracé / afwijking KLIC", description: "KPN-kabel 40 cm oostelijker; teruggemeld.", priority: "midden", category: "techniek", finding_ids: ["2"], capture_ids: [cp[8]!] },
        { title: "Verkeersmaatregel Binnendijkstraat", description: "Verkeersplan goedgekeurd.", priority: "midden", category: "veiligheid", finding_ids: ["3"], capture_ids: [cp[5]!] },
      ],
      sections: [
        { key: "doel_scope", title: "Doel en scope", blocks: [{ type: "paragraph", text: t.purposeText }, { type: "paragraph", text: "Scope: het volledige tracé van station ZWL-STH-4012 tot ZWL-STH-4013 (circa 1,2 km), inclusief de kruisingen met de watergang langs de Frankhuizerallee, de Binnendijkstraat en de Oude Wetering. De schouw is gelopen met de uitvoerder van Grondwerk Oost BV en de groenbeheerder van de gemeente Zwolle." }] },
        { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "paragraph", text: "De kaart toont de gelopen route (GPS-track), de genummerde fotolocaties, de bevindingen en de KLIC-leveringen." }, { type: "map", bbox: null }] },
        {
          key: "bevindingen",
          title: "Bevindingen",
          blocks: [
            { type: "paragraph", text: "Het tracé start in de brede grasberm naast de stationslocatie ZWL-STH-4012. De eerste 150 m zijn vrij van obstakels." },
            { type: "photo", capture_id: cp[0]!, caption: "Beginpunt tracé bij stationslocatie ZWL-STH-4012", explanation: "Het tracé begint in de grasberm naast het fietspad. Er staan geen bomen of kasten in de eerste 20 m; de lantaarnpaal staat op circa 3 m uit de tracélijn." },
            { type: "finding_ref", finding_index: 0 },
            { type: "photo", capture_id: cp[1]!, caption: "Lindes met kroonprojectie over het tracé", explanation: "De stammen staan op 1,1 m van het tracé en de kronen hangen over de tracélijn. De schouwer heeft ter plaatse ingesproken om het tracé 2 m richting de rijbaan te verleggen en een BEA aan te vragen." },
            { type: "photo", capture_id: cp[2]!, caption: "Brede grasberm", explanation: "Na de bomen is de berm circa 3 m breed en vrij van obstakels; hier kan open worden ontgraven." },
            { type: "finding_ref", finding_index: 1 },
            { type: "photo", capture_id: cp[3]!, caption: "Intredepunt gestuurde boring", explanation: "De verharde strook biedt voldoende ruimte voor een compacte boorstelling en is bereikbaar vanaf de rijbaan." },
            { type: "photo", capture_id: cp[4]!, caption: "Watergang (8,2 m breed)", explanation: "De watergang wordt met een gestuurde boring gekruist; de breedte van 8,2 m is ter plaatse gemeten. Voor de kruising is een watervergunning nodig." },
            { type: "finding_ref", finding_index: 3 },
            { type: "photo", capture_id: cp[5]!, caption: "Kruising Binnendijkstraat", explanation: "Op de kruising moet de rijbaan worden gekruist ter hoogte van de voetgangersoversteek. Een korte boring voorkomt een langdurige afzetting." },
            { type: "paragraph", text: "Langs de Binnendijkstraat ligt het tracé onder het trottoir met klinkerverharding in goede staat. Herstel moet in dezelfde kleur en in keperverband." },
            { type: "photo", capture_id: cp[6]!, caption: "Klinkerverharding trottoir", explanation: "Gebakken klinkers in keperverband, in 2019 vernieuwd. Na de werkzaamheden in hetzelfde verband herstraten." },
            { type: "finding_ref", finding_index: 4 },
            { type: "photo", capture_id: cp[7]!, caption: "Inritten woningen Binnendijkstraat", explanation: "Drie inritten liggen op het tracé; met rijplaten en gefaseerde uitvoering blijven de woningen bereikbaar." },
            { type: "finding_ref", finding_index: 2 },
            { type: "photo", capture_id: cp[8]!, caption: "Proefsleuf met bestaande kabels (MS-kabel op 72 cm)", explanation: "In de proefsleuf liggen een MS-kabel in mantelbuis, telecombuizen en een LS-kabel. De KPN-kabel ligt circa 40 cm oostelijker dan op de KLIC-tekening." },
            { type: "paragraph", text: "De Oude Wetering wordt gekruist met een gestuurde boring van circa 110 m oostelijk naast de voetbrug. Het tracé eindigt bij de stationslocatie ZWL-STH-4013 aan de Werkerlaan." },
            { type: "photo", capture_id: cp[9]!, caption: "Eindpunt bij stationslocatie ZWL-STH-4013", explanation: "De stationslocatie ligt in de groenstrook naast de Werkerlaan; de kabelinvoerzijde is vrij bereikbaar." },
          ],
        },
        { key: "actiepunten", title: "Actiepunten", blocks: [{ type: "paragraph", text: "De acties volgen uit de bevindingen en zijn met de aannemer en de gemeente afgestemd. Alle acties zijn gereed." }] },
        { key: "checklist", title: "Checklist", blocks: [] },
        { key: "bijlagen", title: "Bijlagen", blocks: [] },
      ],
      findings: plain(f),
      actions: [],
      station: null,
      quantities: null,
      open_questions: ["Is de bomeneffectanalyse door de gemeente goedgekeurd?", "Welke dekking onder de waterbodem eist het waterschap voor de Oude Wetering?"],
    }),
    caps,
    fIds,
    { status, editor: c.user.id, reviewer: c.user.id },
  );
  let line = `Tracéschouw Stadshagen (${status})`;
  if (c.finalize) {
    const token = generateToken();
    await db.insert(shareLinks).values({ orgId: c.org.id, reportId: report.id, tokenHash: hashToken(token), label: "Gemeente Zwolle", expiresAt: new Date(Date.now() + 365 * 86_400_000), createdBy: c.user.id });
    line += ` — deellink: /delen/${token}`;
  }
  return line;
}

// ---------------------------------------------------------------------------------------------
// 2. Tracéschouw Hasselterweg (zonnepark) — in bewerking
// ---------------------------------------------------------------------------------------------
async function traceHasselterweg(c: Ctx, projectId: string) {
  const tpl = await templates(c.org.id);
  const t = tpl("trace");
  const start = new Date("2026-09-29T06:45:00Z");
  const [insp] = await db
    .insert(inspections)
    .values({
      orgId: c.org.id,
      projectId,
      templateId: t.id,
      inspectorId: c.user.id,
      title: "Tracéschouw 10 kV-aansluiting zonnepark Hasselterweg",
      status: "verwerkt",
      startedAt: start,
      endedAt: new Date(start.getTime() + 125 * 60_000),
      weather: weather(start, { t: 11.3, p: 0.4, wind: 24, dir: 250, hum: 89, code: 51, desc: "Motregen" }),
      address: "Hasselterweg, 8043 PN Zwolle",
      lat: ROUTE_HASSELT[0]![0],
      lon: ROUTE_HASSELT[0]![1],
      deviceInfo: { userAgent: "Samsung Galaxy S25 (Chrome)", platform: "Android", screen: "412x915" },
      notes: "Tracé gelopen met de grondeigenaren (twee agrariërs) en de projectontwikkelaar van het zonnepark. Provincie Overijssel is wegbeheerder van de Hasselterweg (N331); kabel in de zuidoostelijke berm.",
      createdBy: c.user.id,
    })
    .returning();
  await insertTrack(c.ctx, insp!.id, trackPoints(ROUTE_HASSELT, start, 118, 23));
  const at = (f: number) => interpolate(ROUTE_HASSELT, f);
  const caps = await insertCaptures(c.ctx, insp!.id, start, t, [
    /* 0 */ { key: "tr2-01-start", at: 3, pos: at(0.01), heading: 20, shot: "Beginpunt", analysis: analysis("Beginpunt tracé in de berm van de Hasselterweg.", "Landelijke weg met brede grasberm aan de zuidoostzijde en een sloot achter de berm. De kabel start hier vanaf de aftakking naar het bestaande MS-net.", ["tracé", "berm", "landelijk"], { detected_objects: ["weg", "grasberm", "sloot"] }) },
    /* 1 */ { key: "tr2-02-sloot", at: 14, pos: at(0.1), heading: 30, tags: ["sloot"], analysis: analysis("Sloot parallel aan de weg met berm van circa 2,5 m.", "Watervoerende sloot langs de weg; de berm tussen kantstreep en insteek van de sloot is circa 2,5 m breed. Werkruimte voor open ontgraving is krap.", ["sloot", "berm", "werkruimte"], { possible_findings: [{ category: "techniek", description: "Beperkte werkruimte tussen weg en sloot", priority: "midden", confidence: 0.74 }] }) },
    /* 2 */ { key: "tr2-03-duiker", at: 22, pos: at(0.17), heading: 120, tags: ["duiker"], analysis: analysis("Duiker onder een perceeltoegang.", "Betonnen duiker onder een dam in de sloot. De kabel moet onder de duiker door of met een korte boring worden gekruist.", ["duiker", "kruising", "sloot"], { possible_findings: [{ category: "techniek", description: "Duiker kruisen met korte boring", priority: "laag", confidence: 0.65 }] }) },
    /* 3 */ { key: "tr2-04-erfafrit", at: 30, pos: at(0.24), heading: 110, tags: ["bereikbaarheid"], analysis: analysis("Erfafrit van agrarisch bedrijf aan de Hasselterweg.", "Toegang tot een boerenerf; tijdens uitvoering moet deze bereikbaar blijven voor zwaar landbouwverkeer.", ["erfafrit", "bereikbaarheid", "landbouw"]) },
    /* 4 */ { key: "tr2-05-bomen", at: 41, pos: at(0.33), heading: 40, shot: "Bomen", tags: ["boom"], analysis: analysis("Rij knotwilgen langs de weg, direct naast het tracé.", "Rij pas geknotte wilgen tussen weg en sloot; de wortelzone overlapt met het beoogde tracé over circa 120 m.", ["knotwilgen", "berm", "wortelzone"], { possible_findings: [{ category: "omgeving", description: "Tracé door wortelzone rij knotwilgen over circa 120 m", priority: "hoog", confidence: 0.8 }] }) },
    /* 5 */ { key: "tr2-08-gasleiding", at: 52, pos: at(0.42), heading: 130, tags: ["gasleiding", "kruising"], analysis: analysis("Gele markeerpaal van een gastransportleiding in de berm.", "Gele Gasunie-markeerpaal van een hogedruk gastransportleiding die het tracé kruist. Werkzaamheden binnen de belemmeringenstrook vereisen toestemming van de leidingbeheerder.", ["gasleiding", "markering", "kruising"], { ocr_text: "Gasunie", possible_findings: [{ category: "veiligheid", description: "Kruising hogedruk gasleiding: toestemming leidingbeheerder en handmatig graven", priority: "hoog", confidence: 0.88 }] }) },
    /* 6 */ { key: "tr2-06-kruising", at: 63, pos: at(0.52), heading: 300, shot: "Kruising", tags: ["kruising"], analysis: analysis("Kruising van de Hasselterweg (N331) richting zonnepark.", "Drukke tweestrooks provinciale weg met brede berm en sloot. Het tracé steekt hier over naar de noordzijde; open ontgraving is niet toegestaan, een gestuurde boring is nodig.", ["kruising", "provinciale weg", "verkeer"], { possible_findings: [{ category: "vergunning", description: "Kruising N331 met gestuurde boring; vergunning provincie", priority: "midden", confidence: 0.75 }] }) },
    /* 7 */ { key: "tr2-09-hoogspanning", at: 72, pos: at(0.6), heading: 80, tags: ["hoogspanning"], analysis: analysis("110 kV-hoogspanningslijn kruist het tracé.", "Bovengrondse 110 kV-lijn met mast op circa 40 m van het tracé, boven een strook gras met kavelpad en sloot. Werken met hoge machines onder de lijn vraagt een veiligheidsafstand en afstemming met TenneT.", ["hoogspanning", "mast", "veiligheidsafstand"], { possible_findings: [{ category: "veiligheid", description: "Werken onder hoogspanningslijn: hoogtebeperking machines", priority: "midden", confidence: 0.7 }] }) },
    /* 8 */ { key: "tr2-07-boorstelling", at: 81, pos: at(0.68), heading: 60, shot: "Mogelijke boorlocatie", tags: ["boorlocatie"], analysis: analysis("Boorstelling van de boorderij in de berm.", "Compacte HDD-boorstelling opgesteld en verankerd in de grasberm, boorstangen geladen. De berm biedt voldoende ruimte voor de stelling bij het intredepunt van de kruising met de N331.", ["boring", "boorstelling", "berm"]) },
    /* 9 */ { key: "tr2-10-grondwater", at: 90, pos: at(0.76), heading: 200, tags: ["proefsleuf", "grondwater"], analysis: analysis("Sleuf die vol grondwater loopt.", "Lange ontgraving die half vol met grondwater staat; grondwater op circa 60 cm onder maaiveld en instabiele wanden. Bemaling of een boring is nodig.", ["proefsleuf", "grondwater", "bemaling"], { possible_findings: [{ category: "techniek", description: "Hoge grondwaterstand (60 cm -mv): bemaling nodig", priority: "midden", confidence: 0.77 }] }) },
    /* 10 */ { key: "tr2-12-kabelhaspel", at: 99, pos: at(0.84), heading: 330, tags: ["materiaal"], analysis: analysis("Kabelhaspel met MS-kabel op een haspelwagen.", "Houten kabelhaspel met zwarte MS-kabel op een haspelaanhanger, op de verharde opslaglocatie van de aannemer.", ["kabelhaspel", "materiaal", "opslag"]) },
    /* 11 */ { key: "tr2-11-zonnepark", at: 114, pos: at(0.99), heading: 70, shot: "Eindpunt", analysis: analysis("Eindpunt bij zonnepark Hasselterweg.", "Zonnepark in aanbouw met panelen op stellingen. Het klantstation komt aan de zuidzijde van het park bij de toegangspoort.", ["zonnepark", "eindpunt", "klantstation"]) },
    /* 12 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 75_000, at: 40, pos: at(0.33) },
    /* 13 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 70_000, at: 51, pos: at(0.42) },
    /* 14 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 55_000, at: 89, pos: at(0.76) },
    /* 15 */ { type: "measurement", at: 15, pos: at(0.1), text: "Breedte berm (kantstreep–insteek sloot): 2,5 m" },
    /* 16 */ { type: "measurement", at: 90, pos: at(0.76), text: "Grondwaterstand proefsleuf: 60 cm -mv" },
    /* 17 */ { type: "measurement", at: 72, pos: at(0.6), text: "Afstand hoogspanningsmast tot tracé: 40 m" },
    /* 18 */ { type: "note", at: 31, pos: at(0.24), text: "Agrariër (nr. 112) vraagt om de erfafrit tussen 06:00 en 08:00 en tussen 16:00 en 18:00 vrij te houden (melkwagen)." },
    /* 19 */ { type: "note", at: 53, pos: at(0.42), text: "Gasunie-leiding: werken binnen 5 m alleen na aanvraag en met toezichthouder van de leidingbeheerder ter plaatse." },
    /* 20 */ { type: "scan", at: 52.5, pos: at(0.42), text: "GU-A-554-KP-012", meta: { scanFormat: "qr_code" } },
  ]);
  await db.insert(measurements).values([
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[15]!, photoCaptureId: caps[1]!, kind: "breedte", label: "Breedte berm tussen weg en sloot", value: 2.5, unit: "m", lat: at(0.1)[0], lon: at(0.1)[1], measuredAt: new Date(start.getTime() + 15 * 60_000), createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[16]!, photoCaptureId: caps[9]!, kind: "diepte", label: "Grondwaterstand proefsleuf", value: 60, unit: "cm", lat: at(0.76)[0], lon: at(0.76)[1], measuredAt: new Date(start.getTime() + 90 * 60_000), createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, captureId: caps[17]!, photoCaptureId: caps[7]!, kind: "lengte", label: "Afstand hoogspanningsmast tot tracé", value: 40, unit: "m", lat: at(0.6)[0], lon: at(0.6)[1], measuredAt: new Date(start.getTime() + 72 * 60_000), createdBy: c.user.id },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[12]!, new Date(start.getTime() + 40 * 60_000), [
    { from: 0, to: 18, text: "Bomenrij aan de Hasselterweg, ongeveer honderdtwintig meter lang. De wortels zitten precies waar we de kabel willen leggen." },
    { from: 18, to: 45, text: "Voorstel: dit stuk gestuurd boren op circa één meter twintig diepte, dan blijven we onder de wortelzone." },
    { from: 45, to: 75, text: "Navragen bij de provincie of er een kapvergunning of boomtoets nodig is, het zijn provinciale bomen." },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[13]!, new Date(start.getTime() + 51 * 60_000), [
    { from: 0, to: 22, text: "Hier kruist de gastransportleiding. Gele paal, nummer staat op de paal, ik heb de QR-code gescand." },
    { from: 22, to: 48, text: "Binnen de belemmeringenstrook alleen handmatig graven, en de leidingbeheerder moet een toezichthouder sturen." },
    { from: 48, to: 70, text: "Actie: kruisingsaanvraag indienen, minimaal zes weken doorlooptijd, dus dat moet nu al gebeuren." },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[14]!, new Date(start.getTime() + 89 * 60_000), [
    { from: 0, to: 20, text: "Proefsleuf bij hectometer één komma vijf. Grondwater staat op zestig centimeter onder maaiveld." },
    { from: 20, to: 40, text: "De wanden kalven af. Hier moet bemaald worden of we boren dit stuk ook." },
    { from: 40, to: 55, text: "Bemalingsadvies laten opstellen en melding bij het waterschap doen." },
  ]);
  const fIds = await insertFindings(c.ctx, insp!.id, projectId, caps, [
    { title: "Kruising hogedruk gastransportleiding", description: "Het tracé kruist bij hm 0,85 een hogedruk gastransportleiding (markeringspaal GU-A-554-KP-012). Werken binnen de belemmeringenstrook vereist toestemming en toezicht van de leidingbeheerder.", category: "veiligheid", priority: "hoog", captureIdx: [5, 20], recommendation: "Kruisingsaanvraag indienen bij de leidingbeheerder (doorlooptijd ≥ 6 weken); binnen 5 m handmatig graven onder toezicht.", source: "transcript" },
    { title: "Tracé door wortelzone bomenrij", description: "Over circa 120 m ligt het tracé in de wortelzone van een provinciale bomenrij.", category: "omgeving", priority: "hoog", captureIdx: [4], recommendation: "Dit tracédeel gestuurd boren op circa 1,20 m diepte; boomtoets en eventueel kapvergunning navragen bij provincie Overijssel.", source: "transcript" },
    { title: "Hoge grondwaterstand", description: "In de proefsleuf bij hm 1,5 staat grondwater op 60 cm onder maaiveld; de sleufwanden zijn instabiel.", category: "techniek", priority: "midden", captureIdx: [9, 16], recommendation: "Bemalingsadvies laten opstellen en melding doen bij het waterschap; alternatief: dit deel boren." },
    { title: "Beperkte werkruimte tussen weg en sloot", description: "De berm tussen kantstreep en insteek van de sloot is 2,5 m breed; dat is krap voor open ontgraving met afzetting.", category: "techniek", priority: "midden", captureIdx: [1, 15], recommendation: "Werkvak afzetten conform CROW 96b met halve-rijbaanafzetting; overweeg kettinggraver om de werkbreedte te beperken." },
    { title: "Werken onder 110 kV-hoogspanningslijn", description: "Bij hm 1,2 kruist een bovengrondse 110 kV-verbinding het tracé.", category: "veiligheid", priority: "midden", captureIdx: [7, 17], recommendation: "Maximale werkhoogte machines vastleggen in het V&G-plan; afstemmen met de netbeheerder van de hoogspanningslijn.", source: "ai", accepted: false },
    { title: "Bereikbaarheid erfafrit agrarisch bedrijf", description: "De erfafrit van nr. 112 moet tussen 06:00–08:00 en 16:00–18:00 vrij blijven (melkwagen).", category: "planning", priority: "laag", captureIdx: [3], recommendation: "Rijplaten klaar hebben liggen en de werkvolgorde afstemmen met de agrariër." },
  ]);
  await db.insert(actions).values([
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Kruisingsaanvraag gastransportleiding indienen", owner: "Projectleider", dueDate: "2026-10-06", status: "in_uitvoering", findingIds: [fIds[0]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Boorplan bomenrij Hasselterweg (circa 120 m) opstellen en boomtoets provincie aanvragen", owner: "Ontwerper", dueDate: "2026-10-13", status: "open", findingIds: [fIds[1]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Bemalingsadvies laten opstellen en melding waterschap doen", owner: "Aannemer", dueDate: "2026-10-20", status: "open", findingIds: [fIds[2]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Verkeersmaatregelenplan N331 (halve-rijbaanafzetting) indienen bij provincie Overijssel", owner: "Aannemer", dueDate: "2026-10-27", status: "open", findingIds: [fIds[3]!], source: "ai", aiAccepted: false, createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Werkafspraken erfafrit vastleggen met agrariër nr. 112", owner: "Omgevingsmanager", dueDate: "2026-10-09", status: "gereed", findingIds: [fIds[5]!], source: "handmatig", createdBy: c.user.id },
  ]);
  await answerAll(c.ctx, insp!.id, t, {
    0: { value: "ja" },
    1: { value: 3, note: "Duiker, gastransportleiding en Hasselterweg (N331)" },
    2: { value: "ja", note: "Bomenrij over circa 120 m", caps: [caps[4]!] },
    3: { value: "ja", note: "Berm bij hm 1,35 (intree kruising N331)" },
    4: { value: "Onverhard", note: "Grasberm; asfalt alleen bij kruisingen" },
    5: { value: "nee", note: "Berm 2,5 m tussen weg en sloot" },
    6: { value: "ja", note: "Provincie (wegbeheerder N331), waterschap, leidingbeheerder gastransport" },
    7: { value: "ja", note: "KLIC 26O0613390 klopt met de situatie; gasleiding conform tekening" },
    8: { value: "Belangrijkste knelpunten: kruising gastransportleiding, bomenrij en hoge grondwaterstand. Werkruimte langs de sloot is krap." },
  }, new Date(start.getTime() + 120 * 60_000));
  await participants(c, insp!.id, new Date(start.getTime() + 124 * 60_000), [
    { name: c.user.name, organization: "Toezicht & advies", role: "Toezichthouder", sig: 1 },
    { name: "Gerrit Wolters", organization: "Melkveebedrijf Wolters", role: "Grondeigenaar", sig: 2 },
    { name: "Fleur Nijhuis", organization: "Zonnepark Hasselterweg BV", role: "Projectontwikkelaar", sig: 3 },
  ]);
  await makeReport(
    c.ctx,
    insp!.id,
    (cp, f) => ({
      title: "Schouwverslag tracé 10 kV-aansluiting zonnepark Hasselterweg",
      summary:
        "Op 29 september 2026 is het tracé voor de 10 kV-aansluiting van zonnepark Hasselterweg gelopen over circa 2,0 km, in de zuidoostelijke berm van de Hasselterweg (N331). Aanwezig waren de grondeigenaar en de projectontwikkelaar van het zonnepark.\n\nHet tracé is uitvoerbaar, maar kent drie zware knelpunten: de kruising van een hogedruk gastransportleiding (toestemming en toezicht leidingbeheerder, doorlooptijd ≥ 6 weken), een bomenrij over circa 120 m waar een gestuurde boring nodig is, en een hoge grondwaterstand (60 cm -mv) bij hm 1,5. De berm tussen weg en sloot is met 2,5 m krap. De kruisingsaanvraag voor de gasleiding is direct na de schouw gestart.",
      key_points: [
        { title: "Kruising gastransportleiding", description: "Kruisingsaanvraag ≥ 6 weken; handmatig graven onder toezicht.", priority: "hoog", category: "veiligheid", finding_ids: ["0"], capture_ids: [cp[5]!] },
        { title: "Bomenrij: gestuurde boring", description: "Circa 120 m boren op 1,20 m; boomtoets provincie.", priority: "hoog", category: "omgeving", finding_ids: ["1"], capture_ids: [cp[4]!] },
        { title: "Hoge grondwaterstand", description: "Bemalingsadvies en melding waterschap.", priority: "midden", category: "techniek", finding_ids: ["2"], capture_ids: [cp[9]!] },
        { title: "Krappe berm langs sloot", description: "Halve-rijbaanafzetting N331.", priority: "midden", category: "techniek", finding_ids: ["3"], capture_ids: [cp[1]!] },
      ],
      sections: [
        { key: "doel_scope", title: "Doel en scope", blocks: [{ type: "paragraph", text: t.purposeText }, { type: "paragraph", text: "Scope: tracé van de aftakking op het bestaande 10 kV-net bij de Hasselterweg tot het toekomstige klantstation van zonnepark Hasselterweg (circa 2,0 km). De Hasselterweg (N331) is in beheer bij de provincie Overijssel." }] },
        { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "map", bbox: null }] },
        {
          key: "bevindingen",
          title: "Bevindingen",
          blocks: [
            { type: "paragraph", text: "Het tracé volgt de zuidoostelijke berm van de Hasselterweg. Achter de berm loopt over de hele lengte een watervoerende sloot." },
            { type: "photo", capture_id: cp[0]!, caption: "Beginpunt in de berm van de Hasselterweg", explanation: "De kabel start bij de aftakking op het bestaande MS-net. De berm is hier breed genoeg voor een open ontgraving." },
            { type: "finding_ref", finding_index: 3 },
            { type: "photo", capture_id: cp[1]!, caption: "Sloot langs de berm (berm 2,5 m)", explanation: "Tussen kantstreep en insteek van de sloot is 2,5 m beschikbaar. Met afzetting blijft er weinig werkruimte over; een halve-rijbaanafzetting is nodig." },
            { type: "photo", capture_id: cp[2]!, caption: "Duiker onder perceeltoegang", explanation: "De kabel moet onder de duiker door. Een korte boring voorkomt dat de dam moet worden opengegraven." },
            { type: "finding_ref", finding_index: 5 },
            { type: "photo", capture_id: cp[3]!, caption: "Erfafrit agrarisch bedrijf nr. 112", explanation: "De erfafrit moet in de ochtend en middag vrij blijven voor de melkwagen; dit is met de agrariër afgesproken." },
            { type: "finding_ref", finding_index: 1 },
            { type: "photo", capture_id: cp[4]!, caption: "Knotwilgen langs de Hasselterweg", explanation: "Over circa 120 m ligt het tracé in de wortelzone van de rij knotwilgen. Volgens de ingesproken toelichting wordt dit deel gestuurd geboord op 1,20 m diepte." },
            { type: "finding_ref", finding_index: 0 },
            { type: "photo", capture_id: cp[5]!, caption: "Markeringspaal gastransportleiding", explanation: "De gele paal markeert de hogedruk gasleiding die het tracé kruist. De QR-code (GU-A-554-KP-012) is gescand; binnen 5 m alleen handmatig graven onder toezicht." },
            { type: "photo", capture_id: cp[6]!, caption: "Kruising Hasselterweg (N331)", explanation: "Hier steekt het tracé de drukke provinciale weg over naar de zuidzijde van het zonnepark. Open ontgraving is niet toegestaan; de kruising wordt gestuurd geboord." },
            { type: "finding_ref", finding_index: 4 },
            { type: "photo", capture_id: cp[7]!, caption: "110 kV-lijn boven het tracé", explanation: "De mast staat op 40 m van het tracé. Hoge machines (boorstelling, kraan) moeten onder de lijn voldoende afstand houden." },
            { type: "photo", capture_id: cp[8]!, caption: "Boorstelling in de berm bij hm 1,35", explanation: "De berm biedt voldoende ruimte voor de boorstelling bij het intredepunt van de kruising met de N331." },
            { type: "finding_ref", finding_index: 2 },
            { type: "photo", capture_id: cp[9]!, caption: "Sleuf met grondwater op 60 cm -mv", explanation: "Het grondwater staat hoog en de sleufwanden kalven af. Zonder bemaling is open ontgraving hier niet verantwoord." },
            { type: "paragraph", text: "Het tracé eindigt bij de toegangspoort aan de zuidzijde van het zonnepark, waar het klantstation wordt geplaatst. De kabel ligt al klaar op de opslaglocatie van de aannemer." },
            { type: "photo", capture_id: cp[11]!, caption: "Eindpunt bij zonnepark Hasselterweg", explanation: "Het klantstation komt bij de toegangspoort; de kabelinvoer kan vanaf de berm worden aangelegd." },
            { type: "photo", capture_id: cp[10]!, caption: "Kabelhaspel op opslaglocatie", explanation: "De MS-kabel voor dit tracé ligt klaar op de opslaglocatie van de aannemer." },
          ],
        },
        { key: "actiepunten", title: "Actiepunten", blocks: [] },
        { key: "checklist", title: "Checklist", blocks: [] },
        { key: "bijlagen", title: "Bijlagen", blocks: [] },
      ],
      findings: plain(f),
      actions: [],
      station: null,
      quantities: null,
      open_questions: ["Is voor de bomenrij een boomtoets of kapvergunning van de provincie nodig?", "Welke doorlooptijd hanteert de leidingbeheerder voor de kruisingsaanvraag?", "Wordt het klantstation door de ontwikkelaar of door Enexis geleverd?"],
    }),
    caps,
    fIds,
    { status: "in_bewerking", editor: c.user.id, reviewer: c.user.id },
  );
  return "Tracéschouw Hasselterweg (in bewerking)";
}

// ---------------------------------------------------------------------------------------------
// 3. Stationsoplevering ZWL-STH-4012 — ter review
// ---------------------------------------------------------------------------------------------
async function stationOplevering4012(c: Ctx, projectId: string, st: Station) {
  const tpl = await templates(c.org.id);
  const t = tpl("station_oplevering");
  const start = new Date("2026-09-17T11:00:00Z");
  const [insp] = await db
    .insert(inspections)
    .values({
      orgId: c.org.id,
      projectId,
      templateId: t.id,
      stationId: st.id,
      inspectorId: c.user.id,
      title: "Stationsoplevering ZWL-STH-4012 Frankhuizerallee",
      status: "verwerkt",
      startedAt: start,
      endedAt: new Date(start.getTime() + 75 * 60_000),
      weather: weather(start, { t: 19.1, p: 0.2, wind: 9, dir: 200, hum: 80, code: 61, desc: "Lichte regen" }),
      address: st.address,
      lat: st.lat,
      lon: st.lon,
      deviceInfo: { userAgent: "Samsung Galaxy Tab Active5", platform: "Android", screen: "800x1280" },
      notes: "Oplevering samen met de netbeheerder en de monteur van de stationsleverancier. Station nog niet in bedrijf.",
      createdBy: c.user.id,
    })
    .returning();
  const pos = (): LatLon => [st.lat!, st.lon!];
  const photo = (key: string, at: number, shot: string, cap: string, desc: string, extra: Partial<CaptureAnalysis> = {}): CaptureSpec => ({ key, at, pos: pos(), heading: (at * 37) % 360, shot, analysis: analysis(cap, desc, [], extra) });
  const caps = await insertCaptures(c.ctx, insp!.id, start, t, [
    /* 0 */ photo("st-01-overzicht", 2, "Overzicht vanaf straat", "Compact betonstation met omgeving vanaf de Frankhuizerallee.", "Nieuw compact station met betonbehuizing op nog onafgewerkt maaiveld. Kabelbeschermbuizen liggen klaar voor de kabelinvoer.", { station_component: "buitenkant" }),
    /* 1 */ photo("st-02-deuren", 4, "Vooraanzicht", "Vooraanzicht met stationsdeuren.", "Gesloten stalen deuren met ventilatieroosters en waarschuwingssymbool hoogspanning. Geen beschadigingen.", { station_component: "buitenkant" }),
    /* 2 */ photo("st-03-zijkant", 6, "Zij- en achterkant", "Zij- en achterzijde van het station.", "Wanden onbeschadigd, ventilatieroosters vrij.", { station_component: "buitenkant" }),
    /* 3 */ photo("st-04-naamplaat", 7, "Stationsnummer", "Stationsnummerbord ZWL-STH-4012.", "Bord met stationsnummer ZWL-STH-4012, Enexis Netbeheer, 10 kV en waarschuwingsbord hoogspanning.", { ocr_text: "ZWL-STH-4012 Enexis Netbeheer 10 kV", station_component: "naamplaat" }),
    /* 4 */ photo("st-05-fundatie", 9, "Toegang, fundatie", "Toegang en afwerking maaiveld rond het station.", "Klinkers rondom het station aangesloten; lichte verzakking aan de rechterzijde (circa 2 cm).", { station_component: "toegang_fundatie", possible_findings: [{ category: "kwaliteit", description: "Lichte verzakking klinkers naast station", priority: "laag", confidence: 0.6 }] }),
    /* 5 */ photo("st-06-kabelinvoer", 11, "Kabelinvoer buitenzijde", "Kabelinvoer aan de buitenzijde.", "Kabelinvoeropeningen met afdichtingsmanchetten.", { station_component: "kabelinvoer_buiten" }),
    /* 6 */ photo("st-07-ms-ruimte", 15, "Overzicht MS-ruimte", "Overzicht van de MS-ruimte.", "Schone MS-ruimte met RMU en LS-verdeler.", { station_component: "ms_ruimte" }),
    /* 7 */ photo("st-08-rmu", 17, "MS-installatie (RMU)", "RMU Eaton Xiria met vier velden (K1, K2, K3, T1).", "Ring main unit van Eaton, type Xiria, met drie kabelvelden en één trafoveld. Standindicatoren zichtbaar.", { station_component: "ms_installatie", detected_objects: ["RMU", "kabelveld", "trafoveld"] }),
    /* 8 */ photo("st-09-typeplaat-rmu", 18, "Typeplaat MS-installatie", "Typeplaat van de RMU.", "Typeplaat Eaton Xiria 3K+1T, serienummer XR-2026-118834, bouwjaar 2026, 12 kV, 630 A, vaste isolatie.", { station_component: "ms_typeplaat", ocr_text: "Eaton Xiria 3K+1T XR-2026-118834 2026 12 kV 630 A", nameplate: { merk: "Eaton", type: "Xiria 3K+1T", serienummer: "XR-2026-118834", bouwjaar: 2026, spanning: "12 kV", vermogen: null, stroom: "630 A", norm: "IEC 62271-200" } }),
    /* 9 */ photo("st-10-veld1", 20, "Per veld", "Veld 1: kabelveld richting Werkerlaan.", "Kabelveld K1 met aanduiding richting Werkerlaan (ZWL-STH-4013), kabel aangesloten.", { station_component: "ms_veld" }),
    /* 10 */ photo("st-10-veld2", 21, "Per veld", "Veld 2: kabelveld richting OS Stadshagen.", "Kabelveld K2 met aanduiding richting OS Stadshagen.", { station_component: "ms_veld" }),
    /* 11 */ photo("st-10-veld3", 22, "Per veld", "Veld 3: kabelveld (reserve).", "Kabelveld K3, aanduiding reserve; geen kabel aangesloten.", { station_component: "ms_veld" }),
    /* 12 */ photo("st-10-veld4", 23, "Per veld", "Veld 4: trafoveld met zekering 40 A.", "Trafoveld T1 met HH-zekering 40 A.", { station_component: "ms_veld" }),
    /* 13 */ photo("st-11-eindsluitingen", 25, "Kabelaansluitingen", "MS-eindsluitingen (T-plugs) in de kabelvelden.", "Negen T-plug-eindsluitingen (drie per veld K1, K2, T1), gelabeld L1–L3.", { station_component: "ms_eindsluitingen" }),
    /* 14 */ photo("st-12-trafo", 28, "Transformator overzicht", "Distributietransformator in de traforuimte.", "Oliegevulde distributietransformator met koelribben, olieopvangbak aanwezig.", { station_component: "transformator" }),
    /* 15 */ photo("st-13-typeplaat-trafo", 29, "Typeplaat transformator", "Typeplaat van de transformator.", "SGB-SMIT DOTE 630/10, 630 kVA, 10,5 kV / 420 V, Dyn5, ONAN, bouwjaar 2026.", { station_component: "trafo_typeplaat", ocr_text: "SGB-SMIT DOTE 630/10 630 kVA 10,5 kV/420 V Dyn5 ONAN T-5561207 2026", nameplate: { merk: "SGB-SMIT", type: "DOTE 630/10", serienummer: "T-5561207", bouwjaar: 2026, spanning: "10,5 kV / 420 V", vermogen: "630 kVA", stroom: null, norm: "IEC 60076" } }),
    /* 16 */ photo("st-14-ls-rek", 33, "LS-rek", "LS-verdeler overzicht.", "LS-rek met zes bezette groepen en twee lege posities.", { station_component: "ls_rek" }),
    /* 17 */ photo("st-15-ls-groepen", 35, "LS-groepen", "LS-groepen met NH-zekeringen.", "Zes groepen met NH-zekeringen 250 A, aanduidingen G1–G6; G7 en G8 niet uitgevoerd.", { station_component: "ls_groepen", possible_findings: [{ category: "contract", description: "Twee LS-groepen minder dan ontworpen (6 i.p.v. 8)", priority: "midden", confidence: 0.72 }] }),
    /* 18 */ photo("st-16-kabelkelder", 38, "Kabelkelder", "Kabelkelder en afdichting kabelinvoer.", "Drie invoeren afgedicht; één invoer (rechts) niet afgedicht, zand zichtbaar.", { station_component: "kabelkelder", possible_findings: [{ category: "kwaliteit", description: "Kabelinvoer niet waterdicht afgedicht", priority: "hoog", confidence: 0.78 }] }),
    /* 19 */ photo("st-17-aarding", 41, "Aarding", "Aardrail met aansluitingen.", "Koperen aardrail met zes geel-groene aansluitingen, gelabeld.", { station_component: "aarding" }),
    /* 20 */ photo("st-18-rtu", 43, "Meet- en telecomvoorzieningen", "RTU voor distributieautomatisering.", "RTU met statusleds; communicatie via 4G, status online.", { station_component: "automatisering" }),
    /* 21 */ photo("st-19-veiligheid", 45, "Veiligheid", "Veiligheidsbord, blusmiddel en schema.", "Waarschuwingsbord, CO2-blusser en eenlijnschema aanwezig.", { station_component: "veiligheid" }),
    /* 22 */ photo("st-20-afwerking", 50, "Eindafwerking", "Eindafwerking na oplevering.", "Terrein opgeruimd; maaiveld nog niet ingezaaid.", { station_component: "afwerking" }),
    /* 23 */ { type: "audio", blobUrl: "static:/demo/spraak-station.wav", mime: "audio/wav", durationMs: 60_000, at: 36, pos: pos() },
    /* 24 */ { type: "scan", at: 7.5, pos: pos(), text: "ZWL-STH-4012", meta: { scanFormat: "qr_code" } },
    /* 25 */ { type: "measurement", at: 42, pos: pos(), text: "Aardingsweerstand (opgave aannemer): 1,8 Ω" },
  ]);
  await db.insert(measurements).values({ orgId: c.org.id, inspectionId: insp!.id, captureId: caps[25]!, photoCaptureId: caps[19]!, kind: "overig", label: "Aardingsweerstand", value: 1.8, unit: "Ω", lat: st.lat, lon: st.lon, measuredAt: new Date(start.getTime() + 42 * 60_000), createdBy: c.user.id });
  await insertTranscript(c.ctx, insp!.id, caps[23]!, new Date(start.getTime() + 36 * 60_000), [
    { from: 0, to: 20, text: "LS-rek heeft maar zes groepen, in het ontwerp stonden er acht. Navragen bij de aannemer of dat meer- of minderwerk is." },
    { from: 20, to: 45, text: "Kabelkelder: de rechter invoer is nog niet afgedicht. Dat moet voor inbedrijfname dicht, anders loopt de kelder vol." },
    { from: 45, to: 60, text: "Verder ziet de installatie er netjes uit, alles is gelabeld en het schema hangt aan de wand." },
  ]);
  const fIds = await insertFindings(c.ctx, insp!.id, projectId, caps, [
    { title: "Kabelinvoer kabelkelder niet afgedicht", description: "Eén van de vier kabelinvoeren in de kabelkelder is niet waterdicht afgedicht.", category: "kwaliteit", priority: "hoog", captureIdx: [18], recommendation: "Invoer afdichten met een gas- en waterdichte manchet vóór inbedrijfname; herschouw met foto.", source: "transcript" },
    { title: "LS-rek met 6 in plaats van 8 groepen", description: "Het LS-rek is uitgevoerd met zes groepen; het ontwerp gaat uit van acht.", category: "contract", priority: "midden", captureIdx: [16, 17], recommendation: "Verklaring van de aannemer opvragen; afrekenpost 04.04 pas bevestigen na akkoord over meer-/minderwerk.", source: "transcript" },
    { title: "Lichte verzakking klinkers naast station", description: "Aan de rechterzijde van het station zijn de klinkers circa 2 cm verzakt.", category: "kwaliteit", priority: "laag", captureIdx: [4], recommendation: "Klinkers opnemen, zandbed aanvullen en herstraten.", source: "ai", accepted: false },
  ]);
  await db.insert(actions).values([
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Kabelinvoer kabelkelder waterdicht afdichten en fotobewijs aanleveren", owner: "Aannemer", dueDate: "2026-09-24", status: "gereed", findingIds: [fIds[0]!], source: "ai", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Verklaring aannemer: 6 i.p.v. 8 LS-groepen", owner: "Projectleider", dueDate: "2026-09-30", status: "in_uitvoering", findingIds: [fIds[1]!], source: "handmatig", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Klinkers rechterzijde station herstraten", owner: "Aannemer", dueDate: "2026-10-10", status: "open", findingIds: [fIds[2]!], source: "ai", aiAccepted: false, createdBy: c.user.id },
  ]);
  await answerAll(c.ctx, insp!.id, t, {
    0: { value: "ja" },
    1: { value: "ja", caps: [caps[13]!] },
    2: { value: "nee", note: "Rechter invoer kabelkelder open", caps: [caps[18]!] },
    3: { value: 1.8, note: "Meting door aannemer, meetrapport ontvangen" },
    4: { value: "ja" },
    5: { value: "ja", note: "Maaiveld nog inzaaien" },
    6: { value: "nee", note: "Revisietekening volgt binnen 4 weken" },
  }, new Date(start.getTime() + 65 * 60_000));
  await participants(c, insp!.id, new Date(start.getTime() + 74 * 60_000), [
    { name: c.user.name, organization: "Toezicht & advies", role: "Toezichthouder", sig: 1 },
    { name: "Kees Wolters", organization: "Enexis Netbeheer", role: "Netbeheerder (opdrachtgever)", sig: 3 },
    { name: "Ruud Hendriks", organization: "Eaton Industries", role: "Monteur stationsleverancier", sig: 2 },
  ]);
  const d = emptyStationDescription();
  d.exterior = { type: "Compact", behuizing: "Beton", staat: "Goed, nieuw", bereikbaarheid: "Goed bereikbaar vanaf de Frankhuizerallee", opmerkingen: "Lichte verzakking klinkers rechterzijde", capture_ids: [caps[0]!, caps[1]!, caps[2]!] };
  d.mv_switchgear = {
    fabrikant: "Eaton",
    type: "Xiria 3K+1T",
    bouwjaar: 2026,
    serienummer: "XR-2026-118834",
    nominale_spanning_kv: 12,
    isolatiemedium: "vast",
    aantal_velden: 4,
    velden: [
      { positie: "1", functie: "kabel", aanduiding: "Richting Werkerlaan", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[9]!] },
      { positie: "2", functie: "kabel", aanduiding: "Richting OS Stadshagen", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[10]!] },
      { positie: "3", functie: "kabel", aanduiding: "Reserve", beveiliging: null, kabel_aangesloten: false, capture_ids: [caps[11]!] },
      { positie: "4", functie: "trafo", aanduiding: "Trafo T1", beveiliging: "HH-zekering 40 A", kabel_aangesloten: true, capture_ids: [caps[12]!] },
    ],
    capture_ids: [caps[7]!, caps[8]!],
  };
  d.transformers = [{ fabrikant: "SGB-SMIT", type: "DOTE 630/10", vermogen_kva: 630, primair_kv: 10.5, secundair_v: 420, schakelgroep: "Dyn5", koeling: "ONAN", bouwjaar: 2026, serienummer: "T-5561207", capture_ids: [caps[14]!, caps[15]!] }];
  d.lv_board = { type: "LS-rek 8 posities", aantal_groepen: 6, groepen: Array.from({ length: 6 }, (_, i) => ({ nr: `G${i + 1}`, zekering_a: 250, aanduiding: `Uitgaande kabel ${i + 1}` })), capture_ids: [caps[16]!, caps[17]!] };
  d.cables = { mv_eindsluitingen: ["K1-L1", "K1-L2", "K1-L3", "K2-L1", "K2-L2", "K2-L3", "T1-L1", "T1-L2", "T1-L3"], lv_kabels: ["6× 4x150 Al"], invoer_afdichting: "3 van 4 invoeren afgedicht", capture_ids: [caps[13]!, caps[18]!] };
  d.earthing = { beschrijving: "Aardrail met zes aansluitingen, aardingsweerstand 1,8 Ω (opgave aannemer)", capture_ids: [caps[19]!] };
  d.automation = { rtu: "RTU aanwezig, online", meters: null, communicatie: "4G", capture_ids: [caps[20]!] };
  d.safety = { aanwezig: ["Waarschuwingsbord", "CO2-blusser", "Eenlijnschema"], ontbrekend: [], capture_ids: [caps[21]!] };
  d.overall_condition = "goed";
  d.remarks = "Installatie conform ontwerp, met uitzondering van het aantal LS-groepen en de open kabelinvoer.";
  let desc = mergeAiDescription(null, stationDescriptionSchema.parse(d), 0.8);
  desc = applyManualEdit(desc, "earthing.beschrijving", "Aardrail met zes aansluitingen; aardingsweerstand 1,8 Ω gemeten door aannemer (meetrapport ontvangen).", c.user.id);
  await saveStationDescription(c.ctx, insp!.id, st.id, desc);
  await runAsbuiltCheck(c.ctx, insp!.id);
  const item = await billingItem(c.org.id, projectId);
  await db.insert(billingEvidence).values([
    { orgId: c.org.id, billingItemId: item("04.01"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[7]!, caps[8]!], status: "bevestigd", confidence: 0.95, remark: "1 st RMU 3K+1T geplaatst (Eaton Xiria)", source: "ai", confirmedBy: c.user.id, confirmedAt: new Date("2026-09-19T09:00:00Z"), createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.03"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[14]!, caps[15]!], status: "bevestigd", confidence: 0.95, remark: "1 st trafo 630 kVA (SGB-SMIT DOTE 630/10)", source: "ai", confirmedBy: c.user.id, confirmedAt: new Date("2026-09-19T09:00:00Z"), createdBy: null },
    { orgId: c.org.id, billingItemId: item("03.02"), inspectionId: insp!.id, quantity: 9, captureIds: [caps[13]!], status: "bevestigd", confidence: 0.88, remark: "9 MS-eindsluitingen (3 per veld K1, K2, T1)", source: "ai", confirmedBy: c.user.id, confirmedAt: new Date("2026-09-19T09:00:00Z"), createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.04"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[16]!, caps[17]!], status: "voorgesteld", confidence: 0.7, remark: "LS-rek aanwezig, maar 6 i.p.v. 8 groepen uitgevoerd", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.05"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[0]!, caps[1]!], status: "bevestigd", confidence: 0.92, remark: "Compact betonstation incl. fundatie", source: "ai", confirmedBy: c.user.id, confirmedAt: new Date("2026-09-19T09:00:00Z"), createdBy: null },
    { orgId: c.org.id, billingItemId: item("06.01"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[19]!], status: "voorgesteld", confidence: 0.65, remark: "Diepteaarder; meetrapport 1,8 Ω ontvangen", source: "handmatig", createdBy: c.user.id },
  ]);
  await makeReport(
    c.ctx,
    insp!.id,
    (cp, f) => ({
      title: "Opleveringsverslag MS-station ZWL-STH-4012",
      summary:
        "Op 17 september 2026 is het nieuwe compacte MS-station ZWL-STH-4012 aan de Frankhuizerallee geschouwd voor oplevering, samen met de netbeheerder en de monteur van de stationsleverancier.\n\nDe MS-installatie (Eaton Xiria 3K+1T) en de transformator (SGB-SMIT, 630 kVA) zijn conform ontwerp geplaatst; de typeplaten zijn uitgelezen en vastgelegd. De as-built-check toont één contractuele afwijking: het LS-rek is uitgevoerd met 6 in plaats van 8 groepen. Eén kabelinvoer in de kabelkelder was niet afgedicht; dit is inmiddels hersteld. De revisietekening ontbreekt nog. Voor de afrekening zijn de RMU, de transformator, de eindsluitingen en het station aangetoond; het LS-rek en de aardelektrode wachten op bevestiging.",
      key_points: [
        { title: "Kabelinvoer niet afgedicht (hersteld)", description: "Afgedicht op 23 september; fotobewijs ontvangen.", priority: "hoog", category: "kwaliteit", finding_ids: ["0"], capture_ids: [cp[18]!] },
        { title: "LS-rek: 6 i.p.v. 8 groepen", description: "Contractuele afwijking; verklaring aannemer en afrekening aanpassen.", priority: "midden", category: "contract", finding_ids: ["1"], capture_ids: [cp[16]!, cp[17]!] },
        { title: "Revisietekening ontbreekt", description: "Aannemer levert binnen 4 weken.", priority: "laag", category: "contract", finding_ids: [], capture_ids: [] },
      ],
      sections: [
        { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "map", bbox: null }] },
        {
          key: "bevindingen",
          title: "Bevindingen",
          blocks: [
            { type: "paragraph", text: "Buitenkant: het station staat netjes, deuren en wanden zijn onbeschadigd en het stationsnummer is aangebracht. Het maaiveld moet nog worden ingezaaid." },
            { type: "photo", capture_id: cp[0]!, caption: "Overzicht station vanaf de Frankhuizerallee", explanation: "Het compacte betonstation staat op de beoogde locatie; de kabelbeschermbuizen voor de invoer liggen klaar." },
            { type: "photo", capture_id: cp[3]!, caption: "Stationsnummer ZWL-STH-4012", explanation: "Het stationsnummerbord en het waarschuwingsbord zijn aangebracht; de QR-code op het bord is gescand en komt overeen met het stationsnummer." },
            { type: "finding_ref", finding_index: 2 },
            { type: "photo", capture_id: cp[4]!, caption: "Verzakking klinkers rechterzijde", explanation: "De klinkers aan de rechterzijde zijn circa 2 cm verzakt, vermoedelijk door onvoldoende verdichting van de aanvulling. Herstraten na verdichten is nodig." },
            { type: "finding_ref", finding_index: 0 },
            { type: "photo", capture_id: cp[18]!, caption: "Kabelkelder: rechter invoer niet afgedicht", explanation: "De rechter kabelinvoer was niet afgedicht, waardoor water en zand de kelder in kunnen lopen. De schouwer heeft dit ter plaatse ingesproken; de aannemer heeft de invoer op 23 september afgedicht." },
            { type: "finding_ref", finding_index: 1 },
            { type: "photo", capture_id: cp[17]!, caption: "LS-groepen G1–G6", explanation: "Er zijn zes groepen met NH-zekeringen 250 A uitgevoerd; posities G7 en G8 zijn leeg. Het ontwerp gaat uit van acht groepen." },
          ],
        },
        {
          key: "station",
          title: "Stationsbeschrijving",
          blocks: [
            { type: "paragraph", text: "MS-installatie: Eaton Xiria 3K+1T met drie kabelvelden en één trafoveld (HH-zekering 40 A). Transformator: SGB-SMIT DOTE 630/10, 630 kVA, Dyn5, ONAN." },
            { type: "photo", capture_id: cp[7]!, caption: "MS-installatie Eaton Xiria", explanation: "De RMU heeft drie kabelvelden (K1–K3) en één trafoveld (T1); de standindicatoren zijn duidelijk leesbaar." },
            { type: "photo_grid", capture_ids: [cp[8]!, cp[15]!], caption: "Typeplaten RMU en transformator" },
            { type: "photo_grid", capture_ids: [cp[9]!, cp[10]!, cp[11]!, cp[12]!], caption: "Velden K1, K2, K3 (reserve) en T1" },
            { type: "photo", capture_id: cp[13]!, caption: "MS-eindsluitingen", explanation: "Negen T-plug-eindsluitingen, drie per aangesloten veld, gelabeld L1–L3." },
          ],
        },
        { key: "afrekening", title: "Afrekenonderbouwing", blocks: [{ type: "paragraph", text: "Voorgestelde en bevestigde hoeveelheden met bewijsfoto's. Post 04.04 (LS-rek) wordt pas bevestigd na akkoord over de afwijking in het aantal groepen." }] },
      ],
      findings: plain(f),
      actions: [],
      station: null,
      quantities: null,
      open_questions: ["Is het meetrapport van de aardingsweerstand (1,8 Ω) formeel ontvangen?", "Is de afwijking van 6 i.p.v. 8 LS-groepen meer- of minderwerk?", "Wanneer levert de aannemer de revisietekening?"],
    }),
    caps,
    fIds,
    { status: "ter_review", editor: c.user.id, reviewer: c.user.id },
  );
  return "Stationsoplevering ZWL-STH-4012 (ter review)";
}

async function billingItem(orgId: string, projectId: string) {
  const items = await db.select().from(billingItems).where(and(eq(billingItems.orgId, orgId), eq(billingItems.projectId, projectId)));
  return (code: string) => items.find((i) => i.code === code)!.id;
}

// ---------------------------------------------------------------------------------------------
// 4. Stationsoplevering ZWL-STH-4013 — AI-voorstel (concept) met as-built-afwijking
// ---------------------------------------------------------------------------------------------
async function stationOplevering4013(c: Ctx, projectId: string, st: Station) {
  const tpl = await templates(c.org.id);
  const t = tpl("station_oplevering");
  const start = new Date("2026-10-01T08:30:00Z");
  const [insp] = await db
    .insert(inspections)
    .values({
      orgId: c.org.id,
      projectId,
      templateId: t.id,
      stationId: st.id,
      inspectorId: c.user.id,
      title: "Stationsoplevering ZWL-STH-4013 Werkerlaan",
      status: "verwerkt",
      startedAt: start,
      endedAt: new Date(start.getTime() + 65 * 60_000),
      weather: weather(start, { t: 13.4, p: 0, wind: 15, dir: 220, hum: 76, code: 3, desc: "Bewolkt" }),
      address: st.address,
      lat: st.lat,
      lon: st.lon,
      deviceInfo: { userAgent: "iPhone 16 Pro (Safari)", platform: "iOS", screen: "402x874" },
      notes: "Oplevering met de netbeheerder. Station is spanningsloos; inbedrijfname gepland op 14 oktober.",
      createdBy: c.user.id,
    })
    .returning();
  const pos = (): LatLon => [st.lat!, st.lon!];
  const photo = (key: string, at: number, shot: string, cap: string, desc: string, extra: Partial<CaptureAnalysis> = {}): CaptureSpec => ({ key, at, pos: pos(), heading: (at * 41) % 360, shot, analysis: analysis(cap, desc, [], extra) });
  const caps = await insertCaptures(c.ctx, insp!.id, start, t, [
    /* 0 */ photo("st2-01-overzicht", 2, "Overzicht vanaf straat", "Compact betonstation aan de Werkerlaan met omgeving.", "Lichtgrijs betonstation met groene dubbele deuren op een donkere plint, in de groenstrook naast de Werkerlaan tussen de woningen.", { station_component: "buitenkant" }),
    /* 1 */ photo("st2-02-deuren", 4, "Vooraanzicht", "Voorzijde met groene toegangsdeuren.", "Dubbele deuren gesloten en vergrendeld; waarschuwingsdriehoek en sticker aangebracht. Klein graffitilabel op de rechterdeur.", { station_component: "buitenkant" }),
    /* 2 */ photo("st2-03-zijkant", 5, "Zij- en achterkant", "Zijgevel met graffiti op de deuren.", "Zijgevel met twee hoge groene deuren en waarschuwingsbord; op de onderzijde van de deuren is paarse graffiti aangebracht.", { station_component: "buitenkant", possible_findings: [{ category: "omgeving", description: "Graffiti op de zijdeuren van het station", priority: "laag", confidence: 0.9 }] }),
    /* 3 */ photo("st2-04-naamplaat", 6, "Stationsnummer", "Stationsnummerbord ZWL-STH-4013.", "Bord met stationsnummer ZWL-STH-4013, Enexis Netbeheer, 10 kV, en waarschuwingsbord hoogspanning.", { ocr_text: "ZWL-STH-4013 Enexis Netbeheer 10 kV", station_component: "naamplaat" }),
    /* 4 */ photo("st2-05-fundatie", 8, "Toegang, fundatie", "Plint en aansluiting maaiveld.", "Donkere betonnen plint, netjes aangesloten op het gazon; geen verzakkingen of open voegen zichtbaar. Er is geen verharde opstelplaats voor de deuren.", { station_component: "toegang_fundatie" }),
    /* 5 */ photo("st2-06-kabelinvoer", 10, "Kabelinvoer buitenzijde", "Kabelinvoer onder de fundering (vóór aanvullen).", "Kabels in rode beschermbuizen gaan via afgedichte doorvoeren de fundering in; vastgelegd vóór het aanvullen van de sleuf.", { station_component: "kabelinvoer_buiten" }),
    /* 6 */ photo("st2-07-ms-ruimte", 13, "Overzicht MS-ruimte", "Overzicht MS-ruimte met installatie en transformator.", "Opgeruimde ruimte met de compacte MS-installatie (vier velden) tegen de wand en de transformator in de olieopvangbak.", { station_component: "ms_ruimte" }),
    /* 7 */ photo("st2-08-rmu", 15, "MS-installatie (RMU)", "RMU Eaton Xiria met drie kabelvelden en een trafoveld.", "Compacte MS-installatie met vier velden; veldaanduidingen aangebracht.", { station_component: "ms_installatie", detected_objects: ["RMU", "kabelveld", "trafoveld"] }),
    /* 8 */ photo("st2-09-typeplaat-rmu", 16, "Typeplaat MS-installatie", "Typeplaat van de RMU.", "Typeplaat Eaton Xiria 3K+1T, serienummer XR-2026-119207, bouwjaar 2026, 12 kV, 630 A.", { station_component: "ms_typeplaat", ocr_text: "Eaton Xiria 3K+1T XR-2026-119207 2026 12 kV 630 A", nameplate: { merk: "Eaton", type: "Xiria 3K+1T", serienummer: "XR-2026-119207", bouwjaar: 2026, spanning: "12 kV", vermogen: null, stroom: "630 A", norm: "IEC 62271-200" } }),
    /* 9 */ photo("st2-10-veld1", 18, "Per veld", "Veld 1: kabelveld richting Frankhuizerallee.", "Kabelveld K1, richting ZWL-STH-4012, kabel aangesloten.", { station_component: "ms_veld" }),
    /* 10 */ photo("st2-10-veld2", 19, "Per veld", "Veld 2: kabelveld richting zonnepark Hasselterweg.", "Kabelveld K2, aanduiding 'Zonnepark Hasselterweg', kabel nog niet aangesloten.", { station_component: "ms_veld" }),
    /* 11 */ photo("st2-10-veld3", 20, "Per veld", "Veld 3: kabelveld richting Werkerlaan-Noord.", "Kabelveld K3, kabel aangesloten.", { station_component: "ms_veld" }),
    /* 12 */ photo("st2-10-veld4", 21, "Per veld", "Veld 4: trafoveld.", "Trafoveld T1 met HH-zekering 40 A.", { station_component: "ms_veld" }),
    /* 13 */ photo("st2-11-eindsluitingen", 23, "Kabelaansluitingen", "MS-eindsluitingen.", "Insteek-eindsluitingen op de transformator en in de velden K1, K3 en T1; veld K2 heeft nog blinde afdekkappen.", { station_component: "ms_eindsluitingen", possible_findings: [{ category: "contract", description: "Veld K2 zonder eindsluitingen (6 i.p.v. 9)", priority: "midden", confidence: 0.74 }] }),
    /* 14 */ photo("st2-12-trafo", 26, "Transformator overzicht", "Distributietransformator 400 kVA.", "Oliegevulde distributietransformator (op de conservator staat 400 kVA) met insteekaansluitingen aan MS-zijde, in de olieopvangbak.", { station_component: "transformator" }),
    /* 15 */ photo("st2-13-typeplaat-trafo", 27, "Typeplaat transformator", "Typeplaat transformator: 400 kVA.", "SGB-SMIT DOTE 400/10, 400 kVA, 10,5 kV / 420 V, Dyn5, ONAN, bouwjaar 2026, serienummer T-5561388.", { station_component: "trafo_typeplaat", ocr_text: "SGB-SMIT DOTE 400/10 400 kVA 10,5 kV/420 V Dyn5 ONAN T-5561388 2026", nameplate: { merk: "SGB-SMIT", type: "DOTE 400/10", serienummer: "T-5561388", bouwjaar: 2026, spanning: "10,5 kV / 420 V", vermogen: "400 kVA", stroom: null, norm: "IEC 60076" } }),
    /* 16 */ photo("st2-14-ls-rek", 31, "LS-rek", "LS-verdeler overzicht.", "Open LS-verdeler met NH-lastscheiderstroken, acht groepen uitgevoerd; koperen rail en kabels van onderen.", { station_component: "ls_rek" }),
    /* 17 */ photo("st2-15-ls-groepen", 33, "LS-groepen", "LS-groepen met NH-zekeringen.", "Acht groepen; G1–G5 met 250 A, G6–G8 met 160 A. Aanduiding G7 ontbreekt.", { station_component: "ls_groepen", possible_findings: [{ category: "kwaliteit", description: "Groepsaanduiding G7 ontbreekt", priority: "laag", confidence: 0.6 }] }),
    /* 18 */ photo("st2-16-kabelkelder", 36, "Kabelkelder", "Kabelkelder met MS-kabels.", "MS-kabels komen via afgedichte muurdoorvoeren binnen en zijn aan de wand gebeugeld; kelder droog en schoon.", { station_component: "kabelkelder" }),
    /* 19 */ photo("st2-17-aarding", 39, "Aarding", "Aardrail met aardverbindingen.", "Aardrail met geel-groene aardgeleiders onder de LS-rail; een verbinding naar de trafokuip is niet zichtbaar.", { station_component: "aarding", possible_findings: [{ category: "veiligheid", description: "Aardverbinding trafokuip ontbreekt", priority: "hoog", confidence: 0.71 }] }),
    /* 20 */ photo("st2-18-veiligheid", 42, "Veiligheid", "Waarschuwingsbord levensgevaar op de deur.", "Geel waarschuwingsbord en bliksemschichtdriehoek op de deur; binnen hangt het eenlijnschema. Een blusmiddel ontbreekt.", { station_component: "veiligheid", possible_findings: [{ category: "veiligheid", description: "Blusmiddel ontbreekt", priority: "midden", confidence: 0.68 }] }),
    /* 21 */ photo("st2-19-afwerking", 47, "Eindafwerking", "Afgewerkt station in de omgeving.", "Station op het gazon tussen de tuinen; terrein opgeruimd. Graffiti op de zijdeuren nog aanwezig.", { station_component: "afwerking" }),
    /* 22 */ { type: "audio", blobUrl: "static:/demo/spraak-station.wav", mime: "audio/wav", durationMs: 80_000, at: 26, pos: pos() },
    /* 23 */ { type: "audio", blobUrl: "static:/demo/spraak-station.wav", mime: "audio/wav", durationMs: 45_000, at: 39, pos: pos() },
    /* 24 */ { type: "scan", at: 6.5, pos: pos(), text: "ZWL-STH-4013", meta: { scanFormat: "qr_code" } },
    /* 25 */ { type: "note", at: 44, pos: pos(), text: "Netbeheerder: blusmiddel wordt door Enexis zelf geplaatst bij inbedrijfname — navragen of dit klopt." },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[22]!, new Date(start.getTime() + 26 * 60_000), [
    { from: 0, to: 20, text: "Transformator is een SGB-SMIT van vierhonderd kVA, conform ontwerp. Trafoveld heeft een zekering van veertig ampère, klopt." },
    { from: 20, to: 50, text: "Veld K2 is nog blind, daar komt de kabel naar het zonnepark Hasselterweg. Dus zes eindsluitingen in plaats van negen." },
    { from: 50, to: 80, text: "Voor de afrekening alleen zes eindsluitingen meenemen. De andere drie komen bij de aansluiting van het zonnepark." },
  ]);
  await insertTranscript(c.ctx, insp!.id, caps[23]!, new Date(start.getTime() + 39 * 60_000), [
    { from: 0, to: 20, text: "Aardrail: vijf aansluitingen, maar de verbinding naar de trafokuip zie ik niet. Die moet er wel zijn." },
    { from: 20, to: 45, text: "Dat moet voor inbedrijfname hersteld worden. Ook het blusmiddel ontbreekt nog, en op de zijdeuren zit graffiti." },
  ]);
  const fIds = await insertFindings(c.ctx, insp!.id, projectId, caps, [
    { title: "Aardverbinding transformatorkuip ontbreekt", description: "Op de aardrail zijn vijf aansluitingen aanwezig; de verbinding naar de transformatorkuip ontbreekt.", category: "veiligheid", priority: "hoog", captureIdx: [19], recommendation: "Aardverbinding trafokuip aanbrengen en aardingsmeting herhalen vóór inbedrijfname.", source: "transcript" },
    { title: "Veld K2 zonder eindsluitingen (6 i.p.v. 9)", description: "Kabelveld K2 is gereserveerd voor de kabel naar zonnepark Hasselterweg en heeft nog blinde afdekkappen. Er zijn 6 van de 9 ontworpen MS-eindsluitingen aangebracht.", category: "contract", priority: "midden", captureIdx: [13, 10], recommendation: "Afrekenpost 03.02 voor dit station op 6 stuks zetten; de 3 eindsluitingen van K2 meenemen bij de aansluiting van het zonnepark.", source: "transcript" },
    { title: "Blusmiddel ontbreekt", description: "In het station is geen blusmiddel aanwezig.", category: "veiligheid", priority: "midden", captureIdx: [20], recommendation: "CO2-blusser plaatsen of schriftelijk bevestigen dat Enexis dit bij inbedrijfname doet.", source: "ai", accepted: false },
    { title: "Graffiti op de zijdeuren", description: "Op de zijdeuren en de rechter voordeur van het nieuwe station is graffiti aangebracht.", category: "omgeving", priority: "laag", captureIdx: [2, 1], recommendation: "Graffiti laten verwijderen en de deuren voorzien van een anti-graffiticoating vóór de eindoplevering." },
    { title: "Groepsaanduiding G7 ontbreekt", description: "Op het LS-rek ontbreekt de aanduiding van groep G7.", category: "kwaliteit", priority: "laag", captureIdx: [17], recommendation: "Aanduiding aanbrengen conform eenlijnschema.", source: "ai", accepted: false },
  ]);
  await db.insert(actions).values([
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Aardverbinding trafokuip aanbrengen en aardingsmeting herhalen", owner: "Aannemer", dueDate: "2026-10-09", status: "open", findingIds: [fIds[0]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Afrekening eindsluitingen aanpassen (6 i.p.v. 9); K2 meenemen in aansluiting zonnepark", owner: "Projectleider", dueDate: "2026-10-08", status: "in_uitvoering", findingIds: [fIds[1]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Graffiti verwijderen en anti-graffiticoating aanbrengen", owner: "Aannemer", dueDate: "2026-10-23", status: "open", findingIds: [fIds[3]!], source: "handmatig", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Blusmiddel plaatsen (of afspraak met Enexis vastleggen)", owner: "Aannemer", dueDate: "2026-10-12", status: "open", findingIds: [fIds[2]!], source: "ai", aiAccepted: false, createdBy: c.user.id },
  ]);
  await answerAll(c.ctx, insp!.id, t, {
    0: { value: "ja", note: "Behalve aardverbinding trafokuip" },
    1: { value: "ja", caps: [caps[13]!] },
    2: { value: "ja", caps: [caps[18]!] },
    3: { value: null, note: "Meting volgt na herstel aardverbinding" },
    4: { value: "nee", note: "Schema aanwezig, blusmiddel ontbreekt" },
    5: { value: "ja" },
    6: { value: "ja" },
  }, new Date(start.getTime() + 58 * 60_000));
  await participants(c, insp!.id, new Date(start.getTime() + 64 * 60_000), [
    { name: c.user.name, organization: "Toezicht & advies", role: "Toezichthouder", sig: 1 },
    { name: "Kees Wolters", organization: "Enexis Netbeheer", role: "Netbeheerder (opdrachtgever)", sig: 3 },
  ]);
  const d = emptyStationDescription();
  d.exterior = { type: "Compact", behuizing: "Beton", staat: "Goed, nieuw", bereikbaarheid: "Via het gazon vanaf de Werkerlaan; geen verharde opstelplaats", opmerkingen: "Graffiti op zijdeuren", capture_ids: [caps[0]!, caps[1]!, caps[2]!] };
  d.mv_switchgear = {
    fabrikant: "Eaton",
    type: "Xiria 3K+1T",
    bouwjaar: 2026,
    serienummer: "XR-2026-119207",
    nominale_spanning_kv: 12,
    isolatiemedium: "vast",
    aantal_velden: 4,
    velden: [
      { positie: "1", functie: "kabel", aanduiding: "Richting Frankhuizerallee", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[9]!] },
      { positie: "2", functie: "kabel", aanduiding: "Zonnepark Hasselterweg", beveiliging: null, kabel_aangesloten: false, capture_ids: [caps[10]!] },
      { positie: "3", functie: "kabel", aanduiding: "Richting Werkerlaan-Noord", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[11]!] },
      { positie: "4", functie: "trafo", aanduiding: "Trafo T1", beveiliging: "HH-zekering 40 A", kabel_aangesloten: true, capture_ids: [caps[12]!] },
    ],
    capture_ids: [caps[7]!, caps[8]!],
  };
  d.transformers = [{ fabrikant: "SGB-SMIT", type: "DOTE 400/10", vermogen_kva: 400, primair_kv: 10.5, secundair_v: 420, schakelgroep: "Dyn5", koeling: "ONAN", bouwjaar: 2026, serienummer: "T-5561388", capture_ids: [caps[14]!, caps[15]!] }];
  d.lv_board = {
    type: "LS-rek 8 posities",
    aantal_groepen: 8,
    groepen: Array.from({ length: 8 }, (_, i) => ({ nr: `G${i + 1}`, zekering_a: i < 5 ? 250 : 160, aanduiding: i === 6 ? null : `Uitgaande kabel ${i + 1}` })),
    capture_ids: [caps[16]!, caps[17]!],
  };
  d.cables = { mv_eindsluitingen: ["K1-L1", "K1-L2", "K1-L3", "K3-L1", "K3-L2", "K3-L3"], lv_kabels: ["5× 4x150 Al", "3× 4x95 Al"], invoer_afdichting: "Alle invoeren afgedicht", capture_ids: [caps[13]!, caps[18]!] };
  d.earthing = { beschrijving: "Aardrail met vijf aansluitingen; verbinding trafokuip ontbreekt", capture_ids: [caps[19]!] };
  d.automation = { rtu: null, meters: null, communicatie: null, capture_ids: [] };
  d.safety = { aanwezig: ["Waarschuwingsbord", "Eenlijnschema"], ontbrekend: ["Blusmiddel"], capture_ids: [caps[20]!] };
  d.overall_condition = "redelijk";
  d.remarks = "Installatie netjes afgewerkt en conform ontwerp; veld K2 (zonnepark) nog niet aangesloten. De aardverbinding van de trafokuip ontbreekt en er zit graffiti op de deuren.";
  await saveStationDescription(c.ctx, insp!.id, st.id, mergeAiDescription(null, stationDescriptionSchema.parse(d), 0.76));
  await runAsbuiltCheck(c.ctx, insp!.id);
  const item = await billingItem(c.org.id, projectId);
  await db.insert(billingEvidence).values([
    { orgId: c.org.id, billingItemId: item("04.01"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[7]!, caps[8]!], status: "voorgesteld", confidence: 0.94, remark: "1 st RMU 3K+1T (Eaton Xiria, XR-2026-119207)", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.02"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[14]!, caps[15]!], status: "voorgesteld", confidence: 0.93, remark: "1 st trafo 400 kVA (SGB-SMIT DOTE 400/10)", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("03.02"), inspectionId: insp!.id, quantity: 6, captureIds: [caps[13]!], status: "voorgesteld", confidence: 0.84, remark: "6 eindsluitingen (K1, K3); K2 nog blind (zonnepark)", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.04"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[16]!, caps[17]!], status: "voorgesteld", confidence: 0.86, remark: "LS-rek 8 groepen conform ontwerp", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("04.05"), inspectionId: insp!.id, quantity: 1, captureIds: [caps[0]!, caps[4]!], status: "voorgesteld", confidence: 0.9, remark: "Compact betonstation incl. fundatie", source: "ai", createdBy: null },
  ]);
  await makeReport(
    c.ctx,
    insp!.id,
    (cp, f) => ({
      title: "Opleveringsverslag MS-station ZWL-STH-4013",
      summary:
        "Op 1 oktober 2026 is het nieuwe compacte MS-station ZWL-STH-4013 aan de Werkerlaan geschouwd voor oplevering, samen met de netbeheerder. De MS-installatie (Eaton Xiria 3K+1T), de transformator (SGB-SMIT, 400 kVA) en het LS-rek (8 groepen) zijn conform ontwerp geplaatst; de kabelkelder is droog en afgedicht.\n\nDe as-built-check toont één afwijking: veld K2 is nog niet aangesloten, omdat daar later de kabel naar zonnepark Hasselterweg op komt. Er zijn daarom 6 in plaats van 9 eindsluitingen aangebracht. Vóór de inbedrijfname op 14 oktober moeten de aardverbinding van de transformatorkuip worden aangebracht en de aardingsmeting worden uitgevoerd. Verder ontbreekt het blusmiddel en is er graffiti op de deuren aangebracht.",
      key_points: [
        { title: "Aardverbinding trafokuip ontbreekt", description: "Herstellen en aardingsmeting vóór inbedrijfname.", priority: "hoog", category: "veiligheid", finding_ids: ["0"], capture_ids: [cp[19]!] },
        { title: "Veld K2 nog blind (6 i.p.v. 9 eindsluitingen)", description: "Afrekening op 6 stuks; K2 bij aansluiting zonnepark.", priority: "midden", category: "contract", finding_ids: ["1"], capture_ids: [cp[13]!, cp[10]!] },
        { title: "Blusmiddel ontbreekt", description: "Plaatsen of afspraak met Enexis.", priority: "midden", category: "veiligheid", finding_ids: ["2"], capture_ids: [cp[20]!] },
        { title: "Graffiti op deuren", description: "Verwijderen en anti-graffiticoating.", priority: "laag", category: "omgeving", finding_ids: ["3"], capture_ids: [cp[2]!] },
      ],
      sections: [
        { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "map", bbox: null }] },
        {
          key: "bevindingen",
          title: "Bevindingen",
          blocks: [
            { type: "paragraph", text: "Het station staat op het gazon in de groenstrook naast de Werkerlaan, tussen de woningen. De betonbehuizing en de plint zijn onbeschadigd en het stationsnummer is aangebracht." },
            { type: "photo", capture_id: cp[0]!, caption: "Station ZWL-STH-4013 vanaf de Werkerlaan", explanation: "Lichtgrijs betonstation met groene dubbele deuren op een donkere plint; het terrein rondom is opgeruimd." },
            { type: "photo", capture_id: cp[3]!, caption: "Stationsnummer ZWL-STH-4013", explanation: "Het stationsnummerbord is aangebracht en de QR-code is gescand; deze komt overeen met het stationsnummer in het project." },
            { type: "finding_ref", finding_index: 0 },
            { type: "photo", capture_id: cp[19]!, caption: "Aardrail zonder verbinding naar de trafokuip", explanation: "Op de aardrail zitten de geel-groene aardgeleiders van de installatie. De schouwer heeft ingesproken dat de verbinding naar de transformatorkuip ontbreekt; die is verplicht vóór inbedrijfname." },
            { type: "finding_ref", finding_index: 1 },
            { type: "photo", capture_id: cp[13]!, caption: "MS-eindsluitingen", explanation: "De insteek-eindsluitingen in K1, K3 en T1 zijn aangebracht. Veld K2 heeft nog blinde afdekkappen; volgens de ingesproken toelichting komen die drie eindsluitingen bij de aansluiting van het zonnepark." },
            { type: "finding_ref", finding_index: 2 },
            { type: "photo", capture_id: cp[20]!, caption: "Waarschuwingsbord op de deur", explanation: "Waarschuwingsbord en eenlijnschema zijn aanwezig; het blusmiddel ontbreekt nog." },
            { type: "finding_ref", finding_index: 3 },
            { type: "photo", capture_id: cp[2]!, caption: "Graffiti op de zijdeuren", explanation: "Op de onderzijde van de zijdeuren is paarse graffiti aangebracht. Laten verwijderen en de deuren voorzien van een anti-graffiticoating." },
          ],
        },
        {
          key: "station",
          title: "Stationsbeschrijving",
          blocks: [
            { type: "paragraph", text: "MS-installatie: Eaton Xiria 3K+1T (XR-2026-119207) met drie kabelvelden en één trafoveld (HH-zekering 40 A). Veld K2 is gereserveerd voor zonnepark Hasselterweg. Transformator: SGB-SMIT DOTE 400/10, 400 kVA, Dyn5. LS-rek met acht groepen." },
            { type: "photo", capture_id: cp[6]!, caption: "MS-ruimte met installatie en transformator", explanation: "De compacte MS-installatie staat tegen de wand; de transformator staat in de olieopvangbak." },
            { type: "photo", capture_id: cp[14]!, caption: "Transformator 400 kVA", explanation: "Oliegevulde distributietransformator van 400 kVA, conform ontwerp; de MS-kabels zijn met insteekaansluitingen aangesloten." },
            { type: "photo_grid", capture_ids: [cp[8]!, cp[15]!], caption: "Typeplaten MS-installatie en transformator" },
            { type: "photo_grid", capture_ids: [cp[9]!, cp[10]!, cp[11]!, cp[12]!], caption: "Velden K1, K2 (zonnepark, nog blind), K3 en T1" },
            { type: "photo", capture_id: cp[16]!, caption: "LS-rek met acht groepen", explanation: "Alle acht groepen zijn conform ontwerp uitgevoerd; alleen de aanduiding van G7 ontbreekt." },
          ],
        },
        { key: "afrekening", title: "Afrekenonderbouwing", blocks: [{ type: "paragraph", text: "Alle hoeveelheden zijn AI-voorstellen op basis van de foto's en typeplaten en moeten nog worden bevestigd. Post 03.02: 6 in plaats van 9 eindsluitingen (veld K2 nog blind)." }] },
      ],
      findings: plain(f),
      actions: [],
      station: null,
      quantities: null,
      open_questions: ["Wordt veld K2 aangesloten in de opdracht voor zonnepark Hasselterweg of als meerwerk in dit project?", "Plaatst Enexis het blusmiddel bij inbedrijfname?", "Wanneer wordt de aardingsmeting na herstel uitgevoerd?"],
    }),
    caps,
    fIds,
    { status: "concept", editor: c.user.id, reviewer: c.user.id },
  );
  return "Stationsoplevering ZWL-STH-4013 (AI-voorstel, concept)";
}

// ---------------------------------------------------------------------------------------------
// 5. Opleveringsschouw tracé Stadshagen — AI-voorstel met afrekenhoeveelheden
// ---------------------------------------------------------------------------------------------
async function opleveringTrace(c: Ctx, projectId: string) {
  const tpl = await templates(c.org.id);
  const t = tpl("oplevering_trace");
  const start = new Date("2026-10-06T07:30:00Z");
  const [insp] = await db
    .insert(inspections)
    .values({
      orgId: c.org.id,
      projectId,
      templateId: t.id,
      inspectorId: c.user.id,
      title: "Opleveringsschouw tracé MS-ring Stadshagen",
      status: "verwerkt",
      startedAt: start,
      endedAt: new Date(start.getTime() + 95 * 60_000),
      weather: weather(start, { t: 12.6, p: 0, wind: 10, dir: 190, hum: 82, code: 2, desc: "Half bewolkt" }),
      address: "Frankhuizerallee 120, 8043 XB Zwolle",
      lat: ROUTE[0]![0],
      lon: ROUTE[0]![1],
      deviceInfo: { userAgent: "iPhone 16 Pro (Safari)", platform: "iOS", screen: "402x874" },
      notes: "Tracé na uitvoering gelopen met de uitvoerder en de gemeente (beheer openbare ruimte). Basis voor de afrekening van de grond- en herstelwerkzaamheden.",
      createdBy: c.user.id,
    })
    .returning();
  await insertTrack(c.ctx, insp!.id, trackPoints(ROUTE, start, 90, 31));
  const at = (f: number) => interpolate(ROUTE, f);
  const caps = await insertCaptures(c.ctx, insp!.id, start, t, [
    /* 0 */ { key: "opl-03-berm", at: 6, pos: at(0.08), heading: 110, shot: "Herstelde verharding", tags: ["berm"], analysis: analysis("Herstelde grasberm langs de Frankhuizerallee.", "Berm aangevuld met teelaarde en ingezaaid; het gras komt op. Geen zichtbare verzakkingen.", ["berm", "herstel", "ingezaaid"]) },
    /* 1 */ { key: "opl-06-uittrede", at: 24, pos: at(0.31), heading: 30, tags: ["boring"], analysis: analysis("Uittredeput van de boring onder de watergang.", "Boorkop in de uittredeput naast een meetlat; de put moet nog worden aangevuld en de oever hersteld.", ["boring", "mantelbuis", "uittrede"], { possible_findings: [{ category: "kwaliteit", description: "Uittredeput nog open; oever niet hersteld", priority: "midden", confidence: 0.7 }] }) },
    /* 2 */ { key: "opl-02-asfalt", at: 35, pos: at(0.375), heading: 45, shot: "Herstelde verharding", tags: ["asfalt"], analysis: analysis("Asfaltherstel op de kruising met de Binnendijkstraat.", "Sleuf in de rijbaan dichtgezet met nieuw asfalt; naden afgestrooid. Circa 14 m² herstel.", ["asfalt", "kruising", "herstel"]) },
    /* 3 */ { key: "opl-01-klinkers", at: 42, pos: at(0.45), heading: 35, shot: "Herstelde verharding", tags: ["klinkers"], analysis: analysis("Herstraten van het trottoir.", "Nieuwe betonstenen worden op een geëgaliseerd zandbed langs de band gelegd; verband en kleur sluiten aan op de bestaande verharding.", ["bestrating", "herstel"]) },
    /* 4 */ { key: "opl-09-verzakking", at: 47, pos: at(0.5), heading: 125, shot: "Restpunt", tags: ["restpunt"], analysis: analysis("Verzakking in de herstelde bestrating bij een inrit.", "Bij de inrit van nr. 23 is de herstelde bestrating over circa 2 m² 3–4 cm verzakt; er blijft water staan.", ["verzakking", "bestrating", "restpunt"], { possible_findings: [{ category: "kwaliteit", description: "Verzakking herstraatte klinkers bij inrit nr. 23", priority: "midden", confidence: 0.83 }] }) },
    /* 5 */ { key: "opl-07-mof", at: 55, pos: at(0.58), heading: 200, tags: ["mof"], analysis: analysis("Verbindingsmof in de montageput.", "MS-verbindingsmof aangebracht en gelabeld; vastgelegd vóór het dichtzetten van de put.", ["mof", "MS-kabel"]) },
    /* 6 */ { key: "opl-05-markeerlint", at: 57, pos: at(0.6), heading: 210, tags: ["sleuf"], analysis: analysis("Afdekplaten 'Let op hoogspanningskabel' bij de sleuf.", "Oranje kabelafdekplaten met opdruk 'LET OP HOOGSPANNINGSKABEL' liggen klaar naast de open sleuf met rode mantelbuizen.", ["afdekplaten", "sleuf", "kabelbescherming"], { ocr_text: "LET OP HOOGSPANNINGSKABEL" }) },
    /* 7 */ { key: "opl-04-aanvulling", at: 64, pos: at(0.66), heading: 230, tags: ["sleuf"], analysis: analysis("Verdichten van de aanvulling.", "Sleuf wordt laagsgewijs aangevuld en verdicht met een trilplaat.", ["aanvulling", "verdichting"]) },
    /* 8 */ { key: "opl-10-kabelmarkering", at: 78, pos: at(0.8), heading: 330, tags: ["markering"], analysis: analysis("Markeringsplaat kabelligging in de bestrating.", "Gietijzeren markeringsplaat met pijlen die de kabelligging aangeeft, ingestraat in het trottoir.", ["markering", "kabel"]) },
    /* 9 */ { key: "opl-08-opgeruimd", at: 88, pos: at(0.97), heading: 110, shot: "Overzicht na oplevering", analysis: analysis("Overzicht na oplevering bij de Werkerlaan.", "Straat opgeruimd, afzettingen en rijplaten verwijderd, verharding hersteld.", ["oplevering", "opgeruimd"]) },
    /* 10 */ { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 50_000, at: 46, pos: at(0.5) },
    /* 11 */ { type: "measurement", at: 47, pos: at(0.5), text: "Verzakking klinkers inrit nr. 23: 35 mm over 2 m²" },
    /* 12 */ { type: "note", at: 25, pos: at(0.31), text: "Boring watergang: 112 m geboord (boorrapport ontvangen), mantelbuis Ø160 mm." },
    /* 13 */ { type: "note", at: 60, pos: at(0.6), text: "Gemeten tracélengte volgens revisie aannemer: 1.236 m MS-kabel 3x1x240 Al XLPE." },
  ]);
  await db.insert(measurements).values({ orgId: c.org.id, inspectionId: insp!.id, captureId: caps[11]!, photoCaptureId: caps[4]!, kind: "diepte", label: "Verzakking klinkers inrit nr. 23", value: 35, unit: "mm", lat: at(0.5)[0], lon: at(0.5)[1], measuredAt: new Date(start.getTime() + 47 * 60_000), createdBy: c.user.id });
  await insertTranscript(c.ctx, insp!.id, caps[10]!, new Date(start.getTime() + 46 * 60_000), [
    { from: 0, to: 18, text: "Bij de inrit van nummer drieëntwintig zijn de klinkers verzakt, ik meet vijfendertig millimeter over zo'n twee vierkante meter." },
    { from: 18, to: 35, text: "Dat is een restpunt. Aannemer moet opnieuw verdichten en herstraten." },
    { from: 35, to: 50, text: "Verder ligt het trottoir er netjes bij, kleur en verband sluiten goed aan." },
  ]);
  const fIds = await insertFindings(c.ctx, insp!.id, projectId, caps, [
    { title: "Verzakking herstelde bestrating bij inrit nr. 23", description: "De herstelde bestrating bij de inrit van nr. 23 is 35 mm verzakt over circa 2 m²; er blijft water staan.", category: "kwaliteit", priority: "midden", captureIdx: [4, 11], recommendation: "Klinkers opnemen, aanvulling opnieuw verdichten en herstraten; restpunt afmelden met foto.", source: "transcript" },
    { title: "Uittredeput boring watergang nog open", description: "De uittredeput van de boring onder de watergang is nog niet aangevuld en de oever is niet hersteld.", category: "kwaliteit", priority: "midden", captureIdx: [1], recommendation: "Put aanvullen, oever herstellen conform eisen waterschap en afmelden.", source: "ai", accepted: false },
  ]);
  await db.insert(actions).values([
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Restpunt: klinkers inrit nr. 23 herstraten", owner: "Aannemer", dueDate: "2026-10-16", status: "open", findingIds: [fIds[0]!], source: "transcript", createdBy: c.user.id },
    { orgId: c.org.id, inspectionId: insp!.id, projectId, description: "Uittredeput aanvullen en oever watergang herstellen", owner: "Aannemer", dueDate: "2026-10-16", status: "open", findingIds: [fIds[1]!], source: "ai", aiAccepted: false, createdBy: c.user.id },
  ]);
  await answerAll(c.ctx, insp!.id, t, {
    0: { value: "nee", note: "Verzakking bij inrit nr. 23", caps: [caps[3]!, caps[4]!] },
    1: { value: "ja", note: "Berm ingezaaid; oever watergang nog herstellen" },
    2: { value: "ja" },
    3: { value: "ja" },
    4: { value: 2 },
  }, new Date(start.getTime() + 90 * 60_000));
  await participants(c, insp!.id, new Date(start.getTime() + 94 * 60_000), [
    { name: c.user.name, organization: "Toezicht & advies", role: "Toezichthouder", sig: 1 },
    { name: "Mark de Boer", organization: "Grondwerk Oost BV", role: "Uitvoerder aannemer", sig: 2 },
    { name: "Ilse Brink", organization: "Gemeente Zwolle", role: "Beheer openbare ruimte", sig: 3 },
  ]);
  const item = await billingItem(c.org.id, projectId);
  await db.insert(billingEvidence).values([
    { orgId: c.org.id, billingItemId: item("01.01"), inspectionId: insp!.id, quantity: 1236, captureIds: [caps[5]!, caps[6]!], status: "voorgesteld", confidence: 0.82, remark: "1.236 m MS-kabel volgens revisie aannemer; steekproefsgewijs gecontroleerd", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("02.01"), inspectionId: insp!.id, quantity: 112, captureIds: [caps[1]!], status: "voorgesteld", confidence: 0.86, remark: "Boring watergang 112 m (boorrapport)", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("03.01"), inspectionId: insp!.id, quantity: 2, captureIds: [caps[5]!], status: "voorgesteld", confidence: 0.75, remark: "2 verbindingsmoffen in het tracé", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("05.01"), inspectionId: insp!.id, quantity: 286, captureIds: [caps[3]!], status: "voorgesteld", confidence: 0.7, remark: "286 m² klinkers hersteld; 2 m² restpunt bij inrit nr. 23", source: "ai", createdBy: null },
    { orgId: c.org.id, billingItemId: item("05.02"), inspectionId: insp!.id, quantity: 14, captureIds: [caps[2]!], status: "bevestigd", confidence: 0.9, remark: "Asfaltherstel kruising Binnendijkstraat", source: "ai", confirmedBy: c.user.id, confirmedAt: new Date("2026-10-07T08:00:00Z"), createdBy: null },
    { orgId: c.org.id, billingItemId: item("05.03"), inspectionId: insp!.id, quantity: 210, captureIds: [caps[0]!], status: "voorgesteld", confidence: 0.72, remark: "Berm aangevuld en ingezaaid langs Frankhuizerallee", source: "ai", createdBy: null },
  ]);
  await makeReport(
    c.ctx,
    insp!.id,
    (cp, f) => ({
      title: "Opleveringsverslag tracé MS-ring Stadshagen",
      summary:
        "Op 6 oktober 2026 is het tracé van de MS-ring tussen de stations ZWL-STH-4012 en ZWL-STH-4013 na uitvoering geschouwd met de aannemer en de gemeente. De verharding is grotendeels netjes hersteld: klinkers in het oorspronkelijke verband, asfalt op de kruising en een ingezaaide berm.\n\nEr zijn twee restpunten: een verzakking van 35 mm in de herstraatte klinkers bij de inrit van nr. 23, en de nog open uittredeput van de boring onder de watergang. Voor de afrekening zijn op basis van de foto's en de revisie hoeveelheden voorgesteld voor kabel (1.236 m), boring (112 m), moffen, klinkers, asfalt en berm.",
      key_points: [
        { title: "Restpunt verzakking inrit nr. 23", description: "Opnieuw verdichten en herstraten.", priority: "midden", category: "kwaliteit", finding_ids: ["0"], capture_ids: [cp[4]!] },
        { title: "Uittredeput boring nog open", description: "Aanvullen en oever herstellen.", priority: "midden", category: "kwaliteit", finding_ids: ["1"], capture_ids: [cp[1]!] },
      ],
      sections: [
        { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "map", bbox: null }] },
        {
          key: "bevindingen",
          title: "Bevindingen",
          blocks: [
            { type: "paragraph", text: "De berm langs de Frankhuizerallee is aangevuld en ingezaaid. Op de kruising met de Binnendijkstraat is het asfalt hersteld en het trottoir is in het oorspronkelijke verband herstraat." },
            { type: "photo", capture_id: cp[0]!, caption: "Herstelde en ingezaaide berm", explanation: "De berm is aangevuld met teelaarde en ingezaaid; er zijn geen verzakkingen zichtbaar." },
            { type: "photo", capture_id: cp[2]!, caption: "Asfaltherstel kruising Binnendijkstraat", explanation: "De sleuf in de rijbaan is met nieuw asfalt dichtgezet (circa 14 m²); de naden zijn afgestrooid." },
            { type: "photo", capture_id: cp[3]!, caption: "Herstraten trottoir", explanation: "De bestrating wordt op een geëgaliseerd zandbed teruggelegd en sluit in kleur en verband aan op de bestaande verharding." },
            { type: "finding_ref", finding_index: 0 },
            { type: "photo", capture_id: cp[4]!, caption: "Verzakking bij inrit nr. 23 (35 mm)", explanation: "De herstelde bestrating is over circa 2 m² 35 mm verzakt en er blijft water staan; dit is ter plaatse gemeten en ingesproken als restpunt." },
            { type: "finding_ref", finding_index: 1 },
            { type: "photo", capture_id: cp[1]!, caption: "Uittredeput boring watergang", explanation: "De boring (112 m) is gereed en de boorkop is in de uittredeput aangekomen, maar de put is nog open en de oever is nog niet hersteld." },
            { type: "paragraph", text: "Tijdens de uitvoering zijn de mof, het markeerlint en het verdichten van de aanvulling vastgelegd als bewijs voor de afrekening." },
            { type: "photo_grid", capture_ids: [cp[5]!, cp[6]!, cp[7]!], caption: "Mof, kabelafdekplaten en verdichting tijdens uitvoering" },
            { type: "photo", capture_id: cp[9]!, caption: "Overzicht na oplevering bij de Werkerlaan", explanation: "Afzettingen en rijplaten zijn verwijderd; de straat is schoon opgeleverd." },
          ],
        },
        { key: "afrekening", title: "Afrekenonderbouwing", blocks: [{ type: "paragraph", text: "De voorgestelde hoeveelheden zijn gebaseerd op de foto's, de revisie van de aannemer en het boorrapport. Post 05.01 is gecorrigeerd voor het restpunt bij inrit nr. 23." }] },
      ],
      findings: plain(f),
      actions: [],
      station: null,
      quantities: null,
      open_questions: ["Klopt de kabellengte van 1.236 m met de revisietekening?", "Moet het restpunt bij inrit nr. 23 vóór de eindafrekening zijn hersteld?"],
    }),
    caps,
    fIds,
    { status: "concept", editor: c.user.id, reviewer: c.user.id },
  );
  return "Opleveringsschouw tracé Stadshagen (AI-voorstel met afrekenhoeveelheden)";
}

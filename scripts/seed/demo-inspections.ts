import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  actions,
  billingEvidence,
  billingItems,
  captureAnalyses,
  captures,
  checklistAnswers,
  devices,
  findingCaptures,
  findings,
  gpsPoints,
  gpsTracks,
  inspectionParticipants,
  inspections,
  klicImports,
  measurements,
  reports,
  shareLinks,
  transcriptSegments,
  transcripts,
  type Station,
} from "../../src/db/schema";
import type { OrgCtx } from "../../src/db/scope";
import { getTemplatesFull, type TemplateFull } from "../../src/db/queries/templates";
import type { CaptureAnalysis, ReportDraft } from "../../src/lib/ai/schemas";
import { wgs84ToRd, lineLengthMeters } from "../../src/lib/geo/rd";
import { linkItemsToWindows, trackToLineString } from "../../src/lib/geo/track-matching";
import { parseImklXml } from "../../src/lib/geo/klic";
import type { FindingCategory, Priority } from "../../src/lib/domain";
import { buildReportFromDraft } from "../../src/lib/report/build";
import { loadInspectionContext } from "../../src/lib/report/context";
import { saveReportVersion } from "../../src/lib/report/service";
import { emptyStationDescription, stationDescriptionSchema } from "../../src/lib/station/schema";
import { applyManualEdit, mergeAiDescription } from "../../src/lib/station/merge";
import { runAsbuiltCheck, saveStationDescription } from "../../src/lib/station/service";
import { archiveFinalPdf } from "../../src/lib/export/archive";
import { generateToken, hashToken } from "../../src/lib/share";
import { newDeviceToken } from "../../src/lib/devices";
import type { SeedBase } from "./demo";

type LatLon = [number, number];

/**
 * MS-route from station ZWL-STH-4012 to ZWL-STH-4013 (Zwolle-Stadshagen), following the public
 * road: grass verge along the Frankhuizerallee (culvert crossing at ~0.30), footway of the
 * Binnendijkstraat, Twistvlietpad along the Oude Wetering, a directional drilling alongside the
 * footbridge (~0.66–0.77) and the footway of the Werkerlaan. Traced from OSM/PDOK aerial imagery.
 */
export const ROUTE: LatLon[] = [
  [52.52679, 6.061347], [52.526927, 6.061206], [52.527048, 6.061074], [52.527091, 6.061031],
  [52.527209, 6.06091], [52.527258, 6.060858], [52.527299, 6.060797], [52.527381, 6.060654],
  [52.527432, 6.060567], [52.527818, 6.059884], [52.528157, 6.059285], [52.528215, 6.059182],
  [52.52862, 6.058496], [52.52896, 6.05792], [52.529013, 6.05783], [52.529172, 6.057526],
  [52.529217, 6.057447], [52.529535, 6.056893], [52.529578, 6.056811], [52.529888, 6.057289],
  [52.530204, 6.057776], [52.530374, 6.058028], [52.530575, 6.058344], [52.530821, 6.058728],
  [52.530893, 6.058844], [52.53099, 6.059001], [52.53104, 6.059039], [52.531098, 6.059083],
  [52.531355, 6.058186], [52.531472, 6.057748], [52.531533, 6.057525], [52.532519, 6.057225],
  [52.532755, 6.057066], [52.532951, 6.057066], [52.533147, 6.057125], [52.533261, 6.057219],
  [52.533832, 6.057568], [52.53442, 6.057823], [52.534566, 6.05793], [52.534526, 6.058064],
  [52.534449, 6.058166],
];

function interpolate(route: LatLon[], f: number): LatLon {
  const segs = route.slice(1).map((p, i) => ({ a: route[i]!, b: p, len: lineLengthMeters([{ lat: route[i]![0], lon: route[i]![1] }, { lat: p[0], lon: p[1] }]) }));
  const total = segs.reduce((n, s) => n + s.len, 0);
  let d = Math.max(0, Math.min(1, f)) * total;
  for (const s of segs) {
    if (d <= s.len) {
      const t = s.len ? d / s.len : 0;
      return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
    }
    d -= s.len;
  }
  return route[route.length - 1]!;
}

/** Deterministic pseudo-random for stable demo data. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function trackPoints(route: LatLon[], start: Date, minutes: number, seed: number) {
  const r = rng(seed);
  const n = Math.round((minutes * 60) / 5);
  return Array.from({ length: n }, (_, i) => {
    const [lat, lon] = interpolate(route, i / (n - 1));
    return { lat: lat + (r() - 0.5) * 0.00003, lon: lon + (r() - 0.5) * 0.00004, accuracy: 3 + r() * 6, t: new Date(start.getTime() + i * 5000) };
  });
}

const analysis = (caption: string, description: string, tags: string[], extra: Partial<CaptureAnalysis> = {}): CaptureAnalysis => ({
  caption,
  description,
  tags,
  detected_objects: [],
  possible_findings: [],
  ocr_text: null,
  nameplate: null,
  station_component: null,
  privacy_flags: { persons_recognizable: false, license_plates_visible: false, notes: null },
  ...extra,
});

type CaptureSpec = {
  key?: string;
  type?: "photo" | "video" | "audio" | "note" | "measurement" | "scan";
  at: number; // minutes after start
  pos: LatLon;
  heading?: number;
  shot?: string; // shot title prefix
  tags?: string[];
  note?: string;
  text?: string;
  analysis?: CaptureAnalysis;
  blobUrl?: string;
  thumbUrl?: string;
  durationMs?: number;
  mime?: string;
  parent?: string;
  meta?: Record<string, unknown>;
};

async function insertCaptures(ctx: OrgCtx, inspectionId: string, start: Date, template: TemplateFull, specs: CaptureSpec[]) {
  const ids: string[] = [];
  const isNumbered = (s: CaptureSpec) => (s.type ?? "photo") === "photo" || s.type === "video";
  // Photo/video numbers follow capture time, not the order of the specs.
  const seqOf = new Map(
    specs
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => isNumbered(s))
      .sort((a, b) => a.s.at - b.s.at)
      .map(({ i }, n) => [i, n + 1]),
  );
  for (const [i, s] of specs.entries()) {
    const type = s.type ?? "photo";
    const { x, y } = wgs84ToRd(s.pos[0], s.pos[1]);
    const shot = s.shot ? template.shots.find((sh) => sh.title.startsWith(s.shot!)) : undefined;
    const [row] = await db
      .insert(captures)
      .values({
        orgId: ctx.orgId,
        inspectionId,
        type,
        blobUrl: s.blobUrl ?? (s.key ? `static:/demo/${s.key}.jpg` : null),
        thumbUrl: s.thumbUrl ?? (s.key && type === "photo" ? `static:/demo/thumbs/${s.key}.jpg` : null),
        mime: s.mime ?? (type === "photo" ? "image/jpeg" : null),
        size: null,
        durationMs: s.durationMs ?? null,
        lat: s.pos[0],
        lon: s.pos[1],
        rdX: x,
        rdY: y,
        accuracy: 4.5,
        heading: s.heading ?? null,
        locationSource: "gps",
        capturedAt: new Date(start.getTime() + s.at * 60_000),
        source: "phone-camera",
        shotId: shot?.id ?? null,
        tags: s.tags ?? [],
        note: s.note ?? null,
        textContent: s.text ?? null,
        parentCaptureId: s.parent ?? null,
        seq: seqOf.get(i) ?? null,
        meta: (s.meta ?? {}) as never,
        createdBy: ctx.userId,
      })
      .returning();
    if (s.analysis) {
      await db.insert(captureAnalyses).values({ orgId: ctx.orgId, captureId: row!.id, model: "demo-seed", result: s.analysis, accepted: true, createdBy: ctx.userId });
    }
    ids.push(row!.id);
  }
  return ids;
}

async function insertTrack(ctx: OrgCtx, inspectionId: string, pts: ReturnType<typeof trackPoints>) {
  for (let i = 0; i < pts.length; i += 400) {
    await db.insert(gpsPoints).values(pts.slice(i, i + 400).map((p) => ({ orgId: ctx.orgId, inspectionId, lat: p.lat, lon: p.lon, accuracy: p.accuracy, recordedAt: p.t })));
  }
  const line = trackToLineString(pts.map((p) => ({ lat: p.lat, lon: p.lon, t: p.t.getTime() })));
  await db.insert(gpsTracks).values({ orgId: ctx.orgId, inspectionId, lineGeojson: line, pointCount: pts.length, lengthM: lineLengthMeters(pts) });
}

async function insertTranscript(ctx: OrgCtx, inspectionId: string, audioId: string, audioStart: Date, segments: { from: number; to: number; text: string }[]) {
  const [t] = await db
    .insert(transcripts)
    .values({ orgId: ctx.orgId, inspectionId, captureId: audioId, text: segments.map((s) => s.text).join(" "), model: "demo-seed", createdBy: ctx.userId })
    .returning();
  const caps = await db.select({ id: captures.id, capturedAt: captures.capturedAt, type: captures.type }).from(captures).where(eq(captures.inspectionId, inspectionId));
  const items = caps.filter((c) => c.type === "photo" || c.type === "video" || c.type === "measurement").map((c) => ({ id: c.id, t: c.capturedAt.getTime() }));
  const windows = segments.map((s) => ({ start: audioStart.getTime() + s.from * 1000, end: audioStart.getTime() + s.to * 1000 }));
  const linked = linkItemsToWindows(windows, items, 15_000);
  await db.insert(transcriptSegments).values(
    segments.map((s, i) => ({
      orgId: ctx.orgId,
      transcriptId: t!.id,
      inspectionId,
      startMs: s.from * 1000,
      endMs: s.to * 1000,
      startAt: new Date(windows[i]!.start),
      endAt: new Date(windows[i]!.end),
      text: s.text,
      captureIds: linked[i]!,
      createdBy: ctx.userId,
    })),
  );
}

type FindingSpec = { title: string; description: string; category: FindingCategory; priority: Priority; captureIdx: number[]; recommendation: string; status?: "open" | "in_behandeling" | "opgelost"; source?: "handmatig" | "ai" | "transcript"; accepted?: boolean };

async function insertFindings(ctx: OrgCtx, inspectionId: string, projectId: string | null, capIds: string[], specs: FindingSpec[]) {
  const ids: string[] = [];
  for (const [i, f] of specs.entries()) {
    const firstCap = capIds[f.captureIdx[0] ?? -1];
    const [c] = firstCap ? await db.select({ lat: captures.lat, lon: captures.lon }).from(captures).where(eq(captures.id, firstCap)) : [];
    const [row] = await db
      .insert(findings)
      .values({
        orgId: ctx.orgId,
        inspectionId,
        projectId,
        title: f.title,
        description: f.description,
        category: f.category,
        priority: f.priority,
        status: f.status ?? "open",
        recommendation: f.recommendation,
        lat: c?.lat ?? null,
        lon: c?.lon ?? null,
        source: f.source ?? "handmatig",
        aiAccepted: f.accepted ?? true,
        seq: i + 1,
        createdBy: ctx.userId,
      })
      .returning();
    const linked = f.captureIdx.map((k) => capIds[k]).filter((x): x is string => Boolean(x));
    if (linked.length) await db.insert(findingCaptures).values(linked.map((captureId) => ({ orgId: ctx.orgId, findingId: row!.id, captureId })));
    ids.push(row!.id);
  }
  return ids;
}

async function answerAll(ctx: OrgCtx, inspectionId: string, template: TemplateFull, answers: Record<number, { value: string | number | null; note?: string; caps?: string[] }>, at: Date) {
  const rows = template.checklist.map((item, i) => {
    const a = answers[i] ?? { value: item.answerType === "yes_no_na" ? "ja" : item.answerType === "choice" ? (item.options[0] ?? null) : item.answerType === "number" ? 0 : "" };
    return { orgId: ctx.orgId, inspectionId, itemId: item.id, value: a.value, note: a.note ?? null, captureIds: a.caps ?? [], answeredAt: at, createdBy: ctx.userId };
  });
  if (rows.length) await db.insert(checklistAnswers).values(rows);
}

async function makeReport(
  ctx: OrgCtx,
  inspectionId: string,
  draftFn: (capIds: string[], findingIds: string[]) => ReportDraft,
  capIds: string[],
  findingIds: string[],
  flow: { status: "concept" | "in_bewerking" | "ter_review" | "definitief"; editor: string; reviewer: string },
) {
  const ictx = (await loadInspectionContext(ctx.orgId, inspectionId))!;
  const draft = draftFn(capIds, findingIds);
  const valid = new Set(ictx.captures.map((c) => c.id));
  const built = buildReportFromDraft(ictx, draft, draft.findings.map((f) => f.id), valid, { jobId: null, model: "demo-seed" });
  const [report] = await db.insert(reports).values({ orgId: ctx.orgId, inspectionId, title: draft.title, status: "concept", createdBy: null }).returning();
  const aiCtx = { ...ctx, userId: null };
  await saveReportVersion(aiCtx, report!.id, { ...built, status: "concept", authorId: null, note: "AI-voorstel (demodata)" });
  if (flow.status === "concept") return report!;
  // A human pass: accept key points, answer questions.
  const edited = {
    content: built.content,
    meta: {
      ...built.meta,
      keyPoints: built.meta.keyPoints.map((k) => ({ ...k, accepted: true })),
      openQuestions: built.meta.openQuestions.map((q, i) => ({ ...q, resolved: flow.status === "definitief" || i === 0, answer: flow.status === "definitief" || i === 0 ? "Gecontroleerd ter plaatse en bevestigd." : null })),
    },
  };
  await saveReportVersion({ ...ctx, userId: flow.editor }, report!.id, { ...edited, status: "in_bewerking", authorId: flow.editor, note: "Aandachtspunten gecontroleerd en open vragen beantwoord" });
  if (flow.status === "in_bewerking") return report!;
  await saveReportVersion({ ...ctx, userId: flow.editor }, report!.id, { ...edited, status: "ter_review", authorId: flow.editor, note: "Status: Ter review aanbieden" });
  if (flow.status === "ter_review") return report!;
  const final = await saveReportVersion({ ...ctx, userId: flow.reviewer }, report!.id, { ...edited, status: "definitief", authorId: flow.reviewer, note: "Status: Definitief maken" });
  let exportId: string | null = null;
  try {
    const exp = await archiveFinalPdf({ ...ctx, userId: flow.reviewer }, report!.id, final.id);
    exportId = exp.id;
  } catch (err) {
    console.warn("PDF archiveren mislukt (geen verbinding met PDOK?):", (err as Error).message);
  }
  await db.update(reports).set({ lockedAt: new Date(), finalExportId: exportId }).where(eq(reports.id, report!.id));
  return report!;
}

const klicGml = () => {
  const toRd = (p: LatLon, dx = 0, dy = 0) => {
    const r = wgs84ToRd(p[0], p[1]);
    return `${(r.x + dx).toFixed(2)} ${(r.y + dy).toFixed(2)}`;
  };
  const line = (id: string, dx: number, dy: number) =>
    `<gml:featureMember><us-net-common:UtilityLink gml:id="nl.imkl-KL26O0123456.${id}"><net:centrelineGeometry><gml:LineString gml:id="ls-${id}" srsName="urn:ogc:def:crs:EPSG::28992"><gml:posList>${ROUTE.map((p) => toRd(p, dx, dy)).join(" ")}</gml:posList></gml:LineString></net:centrelineGeometry></us-net-common:UtilityLink></gml:featureMember>`;
  const net = (id: string, thema: string, who: string) =>
    `<gml:featureMember><imkl:Utiliteitsnet gml:id="nl.imkl-KL26O0123456.${id}"><imkl:thema xlink:href="http://definities.geostandaarden.nl/imkl2015/id/waarde/Thema/${thema}"/><us-net-common:authorityRole>${who}</us-net-common:authorityRole></imkl:Utiliteitsnet></gml:featureMember>`;
  const el = (tag: string, id: string, link: string, netId: string) =>
    `<gml:featureMember><${tag} gml:id="nl.imkl-KL26O0123456.${id}"><net:link xlink:href="nl.imkl-KL26O0123456.${link}"/><net:inNetwork xlink:href="nl.imkl-KL26O0123456.${netId}"/></${tag}></gml:featureMember>`;
  return `<?xml version="1.0" encoding="UTF-8"?><gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:imkl="http://www.geostandaarden.nl/imkl/wibon" xmlns:us-net-common="http://inspire.ec.europa.eu/schemas/us-net-common/4.0" xmlns:us-net-el="http://inspire.ec.europa.eu/schemas/us-net-el/4.0" xmlns:us-net-wa="http://inspire.ec.europa.eu/schemas/us-net-wa/4.0" xmlns:us-net-ogc="http://inspire.ec.europa.eu/schemas/us-net-ogc/4.0" xmlns:net="http://inspire.ec.europa.eu/schemas/net/4.0" xmlns:xlink="http://www.w3.org/1999/xlink">
${net("net-ms", "middenspanning", "Enexis Netbeheer")}${net("net-gas", "gasLageDruk", "Enexis Netbeheer")}${net("net-water", "water", "Vitens")}${net("net-data", "datatransport", "KPN")}
${line("link-ms", 0, 0)}${line("link-gas", 3.5, 2.5)}${line("link-water", -4, -3)}${line("link-data", 1.5, -1.5)}
${el("us-net-el:ElectricityCable", "c-ms", "link-ms", "net-ms")}${el("us-net-ogc:OilGasChemicalsPipe", "c-gas", "link-gas", "net-gas")}${el("us-net-wa:WaterPipe", "c-water", "link-water", "net-water")}${el("us-net-common:TelecommunicationsCable", "c-data", "link-data", "net-data")}
</gml:FeatureCollection>`;
};

export async function seedDemoInspections(base: SeedBase, project: { id: string; number: string }, stations: Station[]) {
  const { org, users } = base;
  const ctxAs = (role: keyof typeof users): OrgCtx => ({ orgId: org.id, userId: users[role].id, role: role === "lezer" ? "lezer" : role });
  const schouwer = ctxAs("schouwer");
  const templates = await getTemplatesFull({ orgId: org.id, userId: null, role: "admin" });
  const tpl = (key: string) => templates.find((t) => t.key === key)!;
  const summary: string[] = [];

  // ---------------------------------------------------------------- KLIC
  await db.insert(klicImports).values({
    orgId: org.id,
    projectId: project.id,
    name: "Levering_26O0123456.zip",
    meldingnummer: "26O0123456",
    featureCount: 4,
    geojson: parseImklXml(klicGml()),
    createdBy: users.projectleider.id,
  });

  // ---------------------------------------------------------------- 1. Tracéschouw (definitief)
  {
    const t = tpl("trace");
    const start = new Date("2026-09-08T07:30:00Z");
    const [insp] = await db
      .insert(inspections)
      .values({
        orgId: org.id,
        projectId: project.id,
        templateId: t.id,
        inspectorId: users.schouwer.id,
        title: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan",
        status: "verwerkt",
        startedAt: start,
        endedAt: new Date(start.getTime() + 95 * 60_000),
        weather: { temperatureC: 17.4, precipitationMm: 0, windSpeedKmh: 14, windDirectionDeg: 240, humidity: 72, weatherCode: 2, description: "Half bewolkt", observedAt: start.toISOString(), source: "open-meteo" },
        address: "Frankhuizerallee 120, 8043 XB Zwolle",
        lat: ROUTE[0]![0],
        lon: ROUTE[0]![1],
        deviceInfo: { userAgent: "Demo iPhone 16 (Safari)", platform: "iOS", screen: "393x852" },
        notes: "Tracé volledig gelopen samen met de aannemer. Boorlocatie bij de watergang nog afstemmen met het waterschap.",
        createdBy: users.schouwer.id,
      })
      .returning();
    await insertTrack(schouwer, insp!.id, trackPoints(ROUTE, start, 90, 7));
    const at = (f: number) => interpolate(ROUTE, f);
    const caps = await insertCaptures(schouwer, insp!.id, start, t, [
      { key: "trace-01-start", at: 2, pos: at(0.02), heading: 110, shot: "Beginpunt", analysis: analysis("Beginpunt van het tracé bij station ZWL-STH-4012 aan de Frankhuizerallee.", "Straatbeeld met fietspad, fietsenstalling en nieuwbouwwoningen. Het tracé start in de berm langs het fietspad naast het nieuwe compacte station. Geen obstakels zichtbaar in de eerste 20 m.", ["tracé", "berm", "klinkers"]) },
      { key: "trace-02-bomen", at: 11, pos: at(0.12), heading: 95, shot: "Bomen", tags: ["boom"], analysis: analysis("Bomenrij direct langs het beoogde tracé in de berm.", "Twee volgroeide straatbomen (vermoedelijk linde) op circa 1 m van de indicatieve tracélijn. De kroonprojectie reikt over het tracé; wortelschade bij open ontgraving is waarschijnlijk.", ["boom", "kroonprojectie", "berm"], { possible_findings: [{ category: "omgeving", description: "Tracé binnen kroonprojectie van twee bomen", priority: "hoog", confidence: 0.8 }] }) },
      { key: "trace-03-kruising", at: 34, pos: at(0.375), heading: 45, shot: "Kruising", tags: ["kruising"], analysis: analysis("Kruising Frankhuizerallee / Binnendijkstraat met voetgangersoversteek.", "Viersprong met asfaltverharding en een voetgangersoversteek. Voor het kruisen van de rijbaan is een verkeersmaatregel of gestuurde boring nodig.", ["kruising", "asfalt", "verkeer"]) },
      { key: "trace-04-klinkers", at: 41, pos: at(0.45), heading: 35, tags: ["verharding"], analysis: analysis("Klinkerverharding van het trottoir langs het tracé.", "Gemêleerde gebakken klinkers in keperverband, in goede staat. Lokaal lichte spoorvorming. Herstel na ontgraving in hetzelfde verband.", ["klinkers", "verharding"]) },
      { key: "trace-05-boorlocatie", at: 25, pos: at(0.27), heading: 20, shot: "Mogelijke boorlocatie", tags: ["boorlocatie"], analysis: analysis("Beoogde intredelocatie voor de gestuurde boring onder de watergang.", "Compacte boorstelling opgesteld op het trottoir bij het intredepunt, werkvak gemarkeerd met bebakening. Voldoende ruimte en bereikbaar vanaf de rijbaan.", ["boring", "boorlocatie", "grasveld"]) },
      { key: "trace-06-sloot", at: 28, pos: at(0.3), heading: 30, tags: ["watergang"], analysis: analysis("Watergang die met een gestuurde boring gekruist moet worden.", "Watergang van circa 8 m breed met natuurlijke oevers. Kruising vereist een watervergunning van het waterschap en een boring met voldoende dekking onder de waterbodem.", ["watergang", "boring", "vergunning"], { possible_findings: [{ category: "vergunning", description: "Watervergunning waterschap nodig voor kruising watergang", priority: "midden", confidence: 0.85 }] }) },
      { key: "trace-07-sleuf", at: 54, pos: at(0.6), heading: 120, tags: ["sleuf", "proefsleuf"], analysis: analysis("Proefsleuf met drie bestaande kabels.", "Proefsleuf van circa 1 m diep. Zichtbaar: gele MS-mantelbuis, bundel gekleurde telecombuizen en een LS-kabel (links onder). Diepte-indicatie (ca. 70 cm tot bovenkant MS-kabel).", ["sleuf", "kabels", "diepte"], { possible_findings: [{ category: "techniek", description: "Bestaande kabels liggen in het beoogde tracé; ligging nieuw tracé aanpassen", priority: "midden", confidence: 0.7 }] }) },
      { key: "trace-08-berm", at: 18, pos: at(0.2), heading: 300, tags: ["berm"], analysis: analysis("Grasberm tussen rijbaan en trottoir.", "Brede grasberm zonder zichtbare obstakels; geschikt voor open ontgraving.", ["berm", "gras"]) },
      { key: "trace-09-oprit", at: 46, pos: at(0.51), heading: 125, tags: ["bereikbaarheid"], analysis: analysis("Inritten van woningen aan de Binnendijkstraat.", "Drie inritten naar woningen. Tijdens uitvoering moet de bereikbaarheid voor bewoners gegarandeerd blijven (rijplaten of gefaseerde uitvoering).", ["inrit", "bereikbaarheid", "BLVC"], { privacy_flags: { persons_recognizable: false, license_plates_visible: true, notes: "Geparkeerde auto met leesbaar kenteken op de achtergrond" } }) },
      { key: "trace-10-eind", at: 88, pos: at(0.99), heading: 110, shot: "Eindpunt", analysis: analysis("Eindpunt van het tracé bij station ZWL-STH-4013 aan de Werkerlaan.", "Stationslocatie in de groenstrook naast de Werkerlaan, bij een bestaande kabelkast. Kabelinvoerzijde vrij bereikbaar.", ["station", "eindpunt"]) },
      { type: "video", blobUrl: "static:/demo/video-trace.mp4", thumbUrl: "static:/demo/thumbs/trace-06-sloot.jpg", mime: "video/mp4", durationMs: 8000, at: 27, pos: at(0.295), heading: 30, meta: { keyframes: [{ url: "static:/demo/trace-05-boorlocatie.jpg", offsetMs: 0 }, { url: "static:/demo/trace-06-sloot.jpg", offsetMs: 4000 }] }, analysis: analysis("Video van boorlocatie en watergang.", "Panorama van de intredelocatie naar de watergang; toont de ruimte voor de boorstelling en de oevers.", ["video", "boring", "watergang"]) },
      { type: "audio", blobUrl: "static:/demo/spraak-trace.wav", mime: "audio/wav", durationMs: 90_000, at: 10, pos: at(0.11) },
      { type: "note", at: 42, pos: at(0.47), text: "Aannemer geeft aan dat de klinkers in dit deel in 2019 zijn vernieuwd; herstel in dezelfde kleur en hetzelfde verband." },
      { type: "note", at: 55, pos: at(0.61), text: "KLIC-melding 26O0123456 komt overeen met de situatie in de proefsleuf, behalve de telecomkabel: die ligt circa 40 cm oostelijker." },
      { type: "measurement", at: 54, pos: at(0.605), text: "Diepte bovenkant bestaande MS-kabel: 72 cm" },
      { type: "measurement", at: 28, pos: at(0.3), text: "Breedte watergang: 8,2 m" },
      { type: "note", at: 66, pos: at(0.7), text: "Oude Wetering: kruising met een gestuurde boring van ca. 110 m, oostelijk naast de voetbrug (≥ 5 m uit de brugfundering). Intree op het Twistvlietpad, uittree op de kade aan de noordzijde." },
    ]);
    // measurements rows (captures 14/15 are measurement captures; photo 7 = sleuf).
    await db.insert(measurements).values([
      { orgId: org.id, inspectionId: insp!.id, captureId: caps[14]!, photoCaptureId: caps[6]!, kind: "diepte", label: "Diepte bovenkant bestaande MS-kabel", value: 72, unit: "cm", lat: at(0.605)[0], lon: at(0.605)[1], measuredAt: new Date(start.getTime() + 54 * 60_000), createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, captureId: caps[15]!, photoCaptureId: caps[5]!, kind: "breedte", label: "Breedte watergang", value: 8.2, unit: "m", lat: at(0.3)[0], lon: at(0.3)[1], measuredAt: new Date(start.getTime() + 28 * 60_000), createdBy: users.schouwer.id },
    ]);
    await insertTranscript(schouwer, insp!.id, caps[11]!, new Date(start.getTime() + 10 * 60_000), [
      { from: 0, to: 12, text: "Oké, we staan nu bij de bomenrij aan de Frankhuizerallee. De twee lindes staan maximaal een meter van het tracé." },
      { from: 12, to: 30, text: "Kroonprojectie gaat over het tracé heen, dus hier moeten we echt handmatig graven of het tracé naar de rijbaankant verleggen." },
      { from: 30, to: 55, text: "Actie voor de ontwerper: tracé ter plaatse van de bomen twee meter richting de rijbaan verschuiven en bomeneffectanalyse aanvragen." },
      { from: 55, to: 90, text: "Verder is de berm hier breed genoeg, geen andere obstakels. Verharding is klinkers, goede staat." },
    ]);
    const fIds = await insertFindings(schouwer, insp!.id, project.id, caps, [
      { title: "Tracé binnen kroonprojectie van twee straatbomen", description: "Het tracé ligt op circa 1 m van twee volgroeide lindes; de kroonprojectie reikt over het tracé. Bij open ontgraving is wortelschade te verwachten.", category: "omgeving", priority: "hoog", captureIdx: [1], recommendation: "Tracé ter plaatse 2 m richting rijbaan verleggen of handmatig ontgraven onder begeleiding van een boomdeskundige; bomeneffectanalyse (BEA) laten uitvoeren." },
      { title: "Watervergunning nodig voor kruising watergang", description: "De watergang (8,2 m breed) moet met een gestuurde boring worden gekruist. Hiervoor is een watervergunning van het waterschap vereist.", category: "vergunning", priority: "midden", captureIdx: [4, 5, 10], recommendation: "Watervergunning aanvragen bij Waterschap Drents Overijsselse Delta; boorplan met dekking ≥ 2 m onder waterbodem opstellen." },
      { title: "Bestaande kabels in beoogd tracé", description: "In de proefsleuf zijn LS-, MS- en telecomkabels aangetroffen op circa 72 cm diepte. De telecomkabel ligt circa 40 cm oostelijker dan in de KLIC-melding.", category: "techniek", priority: "midden", captureIdx: [6], recommendation: "Tracé tussen hectometer 0,7 en 0,8 verschuiven naar de berm en extra proefsleuven graven; afwijking KLIC terugmelden bij KPN." },
      { title: "Bereikbaarheid inritten tijdens uitvoering", description: "Drie woninginritten aan de Binnendijkstraat liggen op het tracé.", category: "planning", priority: "laag", captureIdx: [8], recommendation: "Gefaseerd uitvoeren en rijplaten gebruiken; bewoners vooraf informeren (BLVC-plan)." },
      { title: "Kruising Binnendijkstraat vraagt verkeersmaatregel", description: "Het tracé kruist de Binnendijkstraat ter hoogte van de voetgangersoversteek.", category: "veiligheid", priority: "midden", captureIdx: [2], recommendation: "Kruising uitvoeren met een korte gestuurde boring of halve-rijbaanafzetting conform CROW 96b; verkeersplan laten goedkeuren door de gemeente." },
    ]);
    await db.insert(actions).values([
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Tracé ter plaatse van de bomen 2 m richting rijbaan verschuiven en BEA aanvragen", owner: "Ontwerper Demo Infra", dueDate: "2026-09-22", status: "in_uitvoering", findingIds: [fIds[0]!], source: "transcript", createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Watervergunning aanvragen voor kruising watergang", owner: "Projectleider", dueDate: "2026-10-01", status: "open", findingIds: [fIds[1]!], source: "handmatig", createdBy: users.projectleider.id },
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Afwijking telecomkabel terugmelden (KLIC-terugmelding)", owner: "Aannemer", dueDate: "2026-09-15", status: "gereed", findingIds: [fIds[2]!], source: "handmatig", createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Verkeersplan kruising Binnendijkstraat ter goedkeuring indienen bij gemeente Zwolle", owner: "Aannemer", dueDate: "2026-10-06", status: "open", findingIds: [fIds[4]!], source: "ai", createdBy: users.schouwer.id },
    ]);
    await answerAll(schouwer, insp!.id, t, { 1: { value: 2, note: "Binnendijkstraat, watergang Frankhuizerallee en Oude Wetering" }, 2: { value: "ja", caps: [caps[1]!] }, 3: { value: "ja", note: "Grasveld bij watergang" }, 4: { value: "Klinkers" }, 5: { value: "ja" }, 6: { value: "ja", note: "Waterschap en gemeente" }, 7: { value: "ja", note: "Afwijking telecomkabel geconstateerd" }, 8: { value: "Bomen en watergang zijn de belangrijkste knelpunten." } }, new Date(start.getTime() + 88 * 60_000));
    await db.insert(inspectionParticipants).values([
      { orgId: org.id, inspectionId: insp!.id, name: "Sanne Bakker", organization: "Demo Infra BV", role: "Toezichthouder", signatureUrl: "static:/demo/signature-1.png", signedAt: new Date(start.getTime() + 94 * 60_000), createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, name: "Mark de Boer", organization: "Grondwerk Oost BV", role: "Uitvoerder aannemer", signatureUrl: "static:/demo/signature-2.png", signedAt: new Date(start.getTime() + 94 * 60_000), createdBy: users.schouwer.id },
    ]);
    const report = await makeReport(
      schouwer,
      insp!.id,
      (c, f) => ({
        title: "Schouwverslag tracé MS-ring Frankhuizerallee – Werkerlaan",
        summary:
          "Op 8 september 2026 is het voorgenomen MS-tracé tussen de nieuwe stations ZWL-STH-4012 (Frankhuizerallee) en ZWL-STH-4013 (Werkerlaan) over circa 1,2 km geschouwd. Het tracé is grotendeels goed uitvoerbaar in de grasberm en onder klinkerverharding. Drie punten vragen aandacht vóór het definitief ontwerp: (1) het tracé ligt binnen de kroonprojectie van twee straatbomen, (2) de kruising van de watergang vereist een gestuurde boring en een watervergunning, en (3) in de proefsleuf zijn bestaande kabels op circa 72 cm diepte aangetroffen, waarvan de telecomkabel afwijkt van de KLIC-melding. De kruising met de Werkerlaan vraagt een verkeersmaatregel. Met de voorgestelde aanpassingen is het tracé haalbaar binnen de planning.",
        key_points: [
          { title: "Bomen binnen kroonprojectie", description: "Tracé 2 m verleggen of handmatig graven; BEA aanvragen.", priority: "hoog", category: "omgeving", finding_ids: ["0"], capture_ids: [c[1]!] },
          { title: "Watervergunning watergang", description: "Gestuurde boring onder watergang; vergunning waterschap nodig.", priority: "midden", category: "vergunning", finding_ids: ["1"], capture_ids: [c[5]!] },
          { title: "Kabels in tracé / afwijking KLIC", description: "Telecomkabel 40 cm oostelijker dan KLIC; extra proefsleuven.", priority: "midden", category: "techniek", finding_ids: ["2"], capture_ids: [c[6]!] },
          { title: "Verkeersmaatregel kruising Binnendijkstraat", description: "Verkeersplan laten goedkeuren.", priority: "midden", category: "veiligheid", finding_ids: ["4"], capture_ids: [c[2]!] },
        ],
        sections: [
          { key: "doel_scope", title: "Doel en scope", blocks: [{ type: "paragraph", text: t.purposeText }, { type: "paragraph", text: "Scope: het volledige tracé van station ZWL-STH-4012 tot ZWL-STH-4013 (circa 1,2 km), inclusief de kruisingen met de Binnendijkstraat, de watergang langs de Frankhuizerallee en de Oude Wetering. De schouw is samen met de uitvoerder van de aannemer gelopen." }] },
          { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "paragraph", text: "De kaart toont de gelopen route (GPS-track), de genummerde fotolocaties en de bevindingen." }, { type: "map", bbox: null }] },
          {
            key: "bevindingen",
            title: "Bevindingen",
            blocks: [
              { type: "paragraph", text: "Het tracé start in de brede grasberm naast station ZWL-STH-4012. De eerste 150 m zijn zonder obstakels." },
              { type: "photo", capture_id: c[0]!, caption: "Beginpunt tracé bij station ZWL-STH-4012" },
              { type: "finding_ref", finding_index: 0 },
              { type: "photo", capture_id: c[1]!, caption: "Bomenrij met kroonprojectie over het tracé" },
              { type: "finding_ref", finding_index: 4 },
              { type: "photo", capture_id: c[2]!, caption: "Kruising met de Binnendijkstraat" },
              { type: "paragraph", text: "Het trottoir bestaat uit rode betonklinkers in keperverband in goede staat; herstel moet in hetzelfde verband en dezelfde kleur." },
              { type: "photo", capture_id: c[3]!, caption: "Klinkerverharding trottoir" },
              { type: "finding_ref", finding_index: 1 },
              { type: "photo_grid", capture_ids: [c[4]!, c[5]!], caption: "Boorlocatie en watergang" },
              { type: "finding_ref", finding_index: 2 },
              { type: "photo", capture_id: c[6]!, caption: "Proefsleuf met bestaande kabels (diepte MS-kabel 72 cm)" },
              { type: "finding_ref", finding_index: 3 },
              { type: "photo_grid", capture_ids: [c[7]!, c[8]!, c[9]!], caption: "Berm, inritten en eindpunt tracé" },
            ],
          },
          { key: "actiepunten", title: "Actiepunten", blocks: [{ type: "paragraph", text: "De onderstaande acties volgen uit de bevindingen en zijn met de aannemer afgestemd." }] },
          { key: "checklist", title: "Checklist", blocks: [] },
          { key: "bijlagen", title: "Bijlagen", blocks: [] },
        ],
        findings: f.map((id) => ({ id, title: "", description: "", location: null, priority: "midden" as const, category: "kwaliteit" as const, capture_ids: [], recommendation: "" })),
        actions: [],
        station: null,
        quantities: null,
        open_questions: ["Is de bomeneffectanalyse al aangevraagd bij de gemeente?", "Welke dekking onder de waterbodem eist het waterschap?"],
      }),
      caps,
      fIds,
      { status: "definitief", editor: users.schouwer.id, reviewer: users.projectleider.id },
    );
    const token = generateToken();
    await db.insert(shareLinks).values({ orgId: org.id, reportId: report.id, tokenHash: hashToken(token), label: "Gemeente Zwolle (demo)", expiresAt: new Date(Date.now() + 365 * 86_400_000), createdBy: users.projectleider.id });
    summary.push(`Deellink definitief tracéverslag: /delen/${token}`);
  }

  // ---------------------------------------------------------------- 2. Stationsopleveringsschouw (concept, AI-voorstel)
  {
    const t = tpl("station_oplevering");
    const st = stations.find((s) => s.code === "ZWL-STH-4012")!;
    const start = new Date("2026-09-17T11:00:00Z");
    const [insp] = await db
      .insert(inspections)
      .values({
        orgId: org.id,
        projectId: project.id,
        templateId: t.id,
        stationId: st.id,
        inspectorId: users.schouwer.id,
        title: "Stationsoplevering ZWL-STH-4012 Frankhuizerallee",
        status: "verwerkt",
        startedAt: start,
        endedAt: new Date(start.getTime() + 70 * 60_000),
        weather: { temperatureC: 19.1, precipitationMm: 0.2, windSpeedKmh: 9, windDirectionDeg: 200, humidity: 80, weatherCode: 61, description: "Lichte regen", observedAt: start.toISOString(), source: "open-meteo" },
        address: st.address,
        lat: st.lat,
        lon: st.lon,
        deviceInfo: { userAgent: "Demo Samsung Galaxy Tab Active5", platform: "Android", screen: "800x1280" },
        createdBy: users.schouwer.id,
      })
      .returning();
    const pos = (i: number): LatLon => [st.lat! + Math.sin(i) * 0.00004, st.lon! + Math.cos(i) * 0.00006];
    await insertTrack(schouwer, insp!.id, trackPoints([pos(0), pos(2), pos(4), pos(6)], start, 65, 11));
    const photo = (key: string, at: number, shot: string, cap: string, desc: string, extra: Partial<CaptureAnalysis> = {}, i = 0): CaptureSpec => ({ key, at, pos: pos(i), heading: (i * 47) % 360, shot, analysis: analysis(cap, desc, [], extra) });
    const caps = await insertCaptures(schouwer, insp!.id, start, t, [
      photo("st-01-overzicht", 2, "Overzicht vanaf straat", "Compact betonstation met omgeving vanaf de Frankhuizerallee.", "Nieuw compact station met betonbehuizing (wit/antraciet) op nog onafgewerkt maaiveld. Rode kabelbeschermbuizen liggen klaar voor de kabelinvoer.", { station_component: "buitenkant" }, 1),
      photo("st-02-deuren", 4, "Vooraanzicht", "Vooraanzicht met stationsdeuren.", "Gesloten stalen deuren met ventilatieroosters en waarschuwingssymbool hoogspanning. Geen beschadigingen.", { station_component: "buitenkant" }, 2),
      photo("st-03-zijkant", 6, "Zij- en achterkant", "Zij- en achterzijde van het station.", "Wanden onbeschadigd, ventilatieroosters vrij.", { station_component: "buitenkant" }, 3),
      photo("st-04-naamplaat", 7, "Stationsnummer", "Stationsnummerbord ZWL-STH-4012.", "Bord met stationsnummer ZWL-STH-4012, Enexis Netbeheer, 10 kV en waarschuwingsbord hoogspanning.", { ocr_text: "ZWL-STH-4012 Enexis Netbeheer 10 kV", station_component: "naamplaat" }, 4),
      photo("st-05-fundatie", 9, "Toegang, fundatie", "Toegang en afwerking maaiveld rond station.", "Klinkers rondom het station netjes aangesloten; lichte verzakking aan de rechterzijde (ca. 2 cm).", { station_component: "toegang_fundatie", possible_findings: [{ category: "kwaliteit", description: "Lichte verzakking klinkers naast station", priority: "laag", confidence: 0.6 }] }, 5),
      photo("st-06-kabelinvoer", 11, "Kabelinvoer buitenzijde", "Kabelinvoer aan de buitenzijde van het station.", "Kabelinvoeropeningen met afdichtingsmanchetten.", { station_component: "kabelinvoer_buiten" }, 6),
      photo("st-07-ms-ruimte", 15, "Overzicht MS-ruimte", "Overzicht van de MS-ruimte.", "Schone MS-ruimte met RMU en LS-verdeler.", { station_component: "ms_ruimte" }, 7),
      photo("st-08-rmu", 17, "MS-installatie (RMU)", "RMU Eaton Xiria met vier velden (K1, K2, K3, T1).", "Ring main unit van Eaton, type Xiria, met drie kabelvelden en één trafoveld. Standindicatoren zichtbaar.", { station_component: "ms_installatie", detected_objects: ["RMU", "kabelveld", "trafoveld"] }, 8),
      photo("st-09-typeplaat-rmu", 18, "Typeplaat MS-installatie", "Typeplaat van de RMU.", "Typeplaat Eaton Xiria 3K+1T, serienummer XR-2026-118834, bouwjaar 2026, 12 kV, 630 A, vaste isolatie.", { station_component: "ms_typeplaat", ocr_text: "Eaton Xiria 3K+1T XR-2026-118834 2026 12 kV 630 A", nameplate: { merk: "Eaton", type: "Xiria 3K+1T", serienummer: "XR-2026-118834", bouwjaar: 2026, spanning: "12 kV", vermogen: null, stroom: "630 A", norm: "IEC 62271-200" } }, 9),
      photo("st-10-veld1", 20, "Per veld", "Veld 1: kabelveld richting A.", "Kabelveld K1 met aanduiding richting A, kabel aangesloten.", { station_component: "ms_veld" }, 10),
      photo("st-10-veld2", 21, "Per veld", "Veld 2: kabelveld richting B.", "Kabelveld K2 met aanduiding richting B.", { station_component: "ms_veld" }, 11),
      photo("st-10-veld3", 22, "Per veld", "Veld 3: kabelveld (reserve).", "Kabelveld K3, aanduiding reserve; geen kabel aangesloten.", { station_component: "ms_veld" }, 12),
      photo("st-10-veld4", 23, "Per veld", "Veld 4: trafoveld met zekering 40 A.", "Trafoveld T1 met HH-zekering 40 A.", { station_component: "ms_veld" }, 13),
      photo("st-11-eindsluitingen", 25, "Kabelaansluitingen", "MS-eindsluitingen (T-plugs) in de kabelvelden.", "Negen T-plug eindsluitingen (drie per kabelveld), gelabeld L1–L3.", { station_component: "ms_eindsluitingen" }, 14),
      photo("st-12-trafo", 28, "Transformator overzicht", "Distributietransformator in de traforuimte.", "Oliegevulde distributietransformator met koelribben.", { station_component: "transformator" }, 15),
      photo("st-13-typeplaat-trafo", 29, "Typeplaat transformator", "Typeplaat van de transformator.", "SGB-SMIT DOTE 630/10, 630 kVA, 10,5 kV / 420 V, Dyn5, ONAN, bouwjaar 2026.", { station_component: "trafo_typeplaat", ocr_text: "SGB-SMIT DOTE 630/10 630 kVA 10,5 kV/420 V Dyn5 ONAN T-5561207 2026", nameplate: { merk: "SGB-SMIT", type: "DOTE 630/10", serienummer: "T-5561207", bouwjaar: 2026, spanning: "10,5 kV / 420 V", vermogen: "630 kVA", stroom: null, norm: "IEC 60076" } }, 16),
      photo("st-14-ls-rek", 33, "LS-rek", "LS-verdeler overzicht.", "LS-rek met zes bezette groepen en twee reserveplaatsen.", { station_component: "ls_rek" }, 17),
      photo("st-15-ls-groepen", 35, "LS-groepen", "LS-groepen met NH-zekeringen.", "Zes groepen met NH-zekeringen 250 A, aanduidingen G1–G6; G7 en G8 niet uitgevoerd.", { station_component: "ls_groepen", possible_findings: [{ category: "contract", description: "Twee LS-groepen minder dan ontworpen (6 i.p.v. 8)", priority: "midden", confidence: 0.7 }] }, 18),
      photo("st-16-kabelkelder", 38, "Kabelkelder", "Kabelkelder en afdichting kabelinvoer.", "Drie invoeren afgedicht; één invoer (rechts) niet afgedicht.", { station_component: "kabelkelder", possible_findings: [{ category: "kwaliteit", description: "Kabelinvoer niet waterdicht afgedicht", priority: "hoog", confidence: 0.75 }] }, 19),
      photo("st-17-aarding", 41, "Aarding", "Aardrail met aansluitingen.", "Aardrail met zes aansluitingen (geel-groen).", { station_component: "aarding" }, 20),
      photo("st-18-rtu", 43, "Meet- en telecomvoorzieningen", "RTU voor distributieautomatisering.", "RTU met statusleds, online.", { station_component: "automatisering" }, 21),
      photo("st-19-veiligheid", 45, "Veiligheid", "Veiligheidsbord, blusmiddel en schema.", "Waarschuwingsbord, CO2-blusser en eenlijnschema aanwezig.", { station_component: "veiligheid" }, 22),
      photo("st-20-afwerking", 50, "Eindafwerking", "Eindafwerking na oplevering.", "Terrein opgeruimd.", { station_component: "afwerking" }, 23),
      { type: "audio", blobUrl: "static:/demo/spraak-station.wav", mime: "audio/wav", durationMs: 60_000, at: 36, pos: pos(24) },
      { type: "scan", at: 7.5, pos: pos(4), text: "ZWL-STH-4012", meta: { scanFormat: "qr_code" } },
    ]);
    await insertTranscript(schouwer, insp!.id, caps[23]!, new Date(start.getTime() + 36 * 60_000), [
      { from: 0, to: 20, text: "LS-rek heeft maar zes groepen, in het ontwerp stonden er acht. Navragen bij de aannemer." },
      { from: 20, to: 45, text: "Kabelkelder: de rechter invoer is nog niet afgedicht, dat moet voor oplevering dicht, anders loopt de kelder vol." },
      { from: 45, to: 60, text: "Verder ziet de installatie er netjes uit, alles gelabeld." },
    ]);
    const fIds = await insertFindings(schouwer, insp!.id, project.id, caps, [
      { title: "Kabelinvoer kabelkelder niet afgedicht", description: "Eén van de vier kabelinvoeren in de kabelkelder is niet waterdicht afgedicht.", category: "kwaliteit", priority: "hoog", captureIdx: [18], recommendation: "Invoer afdichten met een gasdichte en waterdichte afdichtingsmanchet vóór inbedrijfname; herschouw met foto.", source: "transcript" },
      { title: "Lichte verzakking klinkers naast station", description: "Aan de rechterzijde van het station zijn de klinkers circa 2 cm verzakt.", category: "kwaliteit", priority: "laag", captureIdx: [4], recommendation: "Klinkers opnemen, zandbed aanvullen en herstraten.", source: "ai", accepted: false },
    ]);
    await db.insert(actions).values([
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Kabelinvoer kabelkelder waterdicht afdichten en fotobewijs aanleveren", owner: "Aannemer", dueDate: "2026-09-24", status: "open", findingIds: [fIds[0]!], source: "ai", aiAccepted: false, createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, projectId: project.id, description: "Verklaring aannemer: 6 i.p.v. 8 LS-groepen", owner: "Projectleider", dueDate: "2026-09-30", status: "open", findingIds: [], source: "handmatig", createdBy: users.projectleider.id },
    ]);
    await answerAll(schouwer, insp!.id, t, { 1: { value: "ja", caps: [caps[13]!] }, 2: { value: "nee", note: "Rechter invoer open", caps: [caps[18]!] }, 3: { value: 1.8, note: "Aardingsmeting uitgevoerd door aannemer" }, 6: { value: "ja" } }, new Date(start.getTime() + 60 * 60_000));
    await db.insert(inspectionParticipants).values([
      { orgId: org.id, inspectionId: insp!.id, name: "Sanne Bakker", organization: "Demo Infra BV", role: "Toezichthouder", signatureUrl: "static:/demo/signature-1.png", signedAt: new Date(start.getTime() + 68 * 60_000), createdBy: users.schouwer.id },
      { orgId: org.id, inspectionId: insp!.id, name: "Kees Wolters", organization: "Enexis Netbeheer", role: "Netbeheerder (opdrachtgever)", signatureUrl: "static:/demo/signature-3.png", signedAt: new Date(start.getTime() + 68 * 60_000), createdBy: users.schouwer.id },
    ]);
    // Station description (AI proposal) + one manual correction; then as-built check.
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
        { positie: "1", functie: "kabel", aanduiding: "Richting A", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[9]!] },
        { positie: "2", functie: "kabel", aanduiding: "Richting B", beveiliging: null, kabel_aangesloten: true, capture_ids: [caps[10]!] },
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
    let doc = mergeAiDescription(null, stationDescriptionSchema.parse(d), 0.78);
    doc = applyManualEdit(doc, "earthing.beschrijving", "Aardrail met zes aansluitingen; aardingsweerstand 1,8 Ω gemeten door aannemer (meetrapport ontvangen).", users.schouwer.id);
    await saveStationDescription(schouwer, insp!.id, st.id, doc);
    await runAsbuiltCheck(schouwer, insp!.id);
    // Billing evidence (AI proposals, some confirmed).
    const items = await db.select().from(billingItems).where(and(eq(billingItems.orgId, org.id), eq(billingItems.projectId, project.id)));
    const item = (code: string) => items.find((i) => i.code === code)!;
    await db.insert(billingEvidence).values([
      { orgId: org.id, billingItemId: item("04.01").id, inspectionId: insp!.id, quantity: 1, captureIds: [caps[7]!, caps[8]!], status: "bevestigd", confidence: 0.95, remark: "1 st RMU 3K+1T geplaatst (Eaton Xiria)", source: "ai", confirmedBy: users.projectleider.id, confirmedAt: new Date(), createdBy: null },
      { orgId: org.id, billingItemId: item("04.03").id, inspectionId: insp!.id, quantity: 1, captureIds: [caps[14]!, caps[15]!], status: "bevestigd", confidence: 0.95, remark: "1 st trafo 630 kVA (SGB-SMIT)", source: "ai", confirmedBy: users.projectleider.id, confirmedAt: new Date(), createdBy: null },
      { orgId: org.id, billingItemId: item("03.02").id, inspectionId: insp!.id, quantity: 9, captureIds: [caps[13]!], status: "voorgesteld", confidence: 0.85, remark: "9 MS-eindsluitingen (3 per veld K1, K2, T1)", source: "ai", createdBy: null },
      { orgId: org.id, billingItemId: item("04.04").id, inspectionId: insp!.id, quantity: 1, captureIds: [caps[16]!], status: "voorgesteld", confidence: 0.7, remark: "LS-rek aanwezig, maar 6 i.p.v. 8 groepen uitgevoerd", source: "ai", createdBy: null },
      { orgId: org.id, billingItemId: item("04.05").id, inspectionId: insp!.id, quantity: 1, captureIds: [caps[0]!, caps[1]!], status: "bevestigd", confidence: 0.9, remark: "Compact betonstation incl. fundatie", source: "ai", confirmedBy: users.projectleider.id, confirmedAt: new Date(), createdBy: null },
      { orgId: org.id, billingItemId: item("06.01").id, inspectionId: insp!.id, quantity: 1, captureIds: [caps[19]!], status: "voorgesteld", confidence: 0.6, remark: "Aardelektrode; meetrapport aannemer", source: "handmatig", createdBy: users.schouwer.id },
    ]);
    const ictx = (await loadInspectionContext(org.id, insp!.id))!;
    const findingIdsAll = ictx.findings.map((f) => f.id);
    await makeReport(
      schouwer,
      insp!.id,
      (c) => ({
        title: "Opleveringsverslag MS-station ZWL-STH-4012",
        summary:
          "Op 17 september 2026 is het nieuwe compacte MS-station ZWL-STH-4012 aan de Frankhuizerallee geschouwd voor oplevering. De MS-installatie (Eaton Xiria 3K+1T) en de transformator (SGB-SMIT 630 kVA) zijn conform ontwerp geplaatst. De as-built-check toont één contractuele afwijking: het LS-rek is uitgevoerd met 6 in plaats van 8 groepen. Daarnaast is één kabelinvoer in de kabelkelder niet afgedicht; dit moet vóór inbedrijfname worden hersteld. Voor de afrekening zijn de RMU, de transformator en het compacte station aangetoond; de eindsluitingen en het LS-rek wachten op bevestiging.",
        key_points: [
          { title: "Kabelinvoer niet afgedicht", description: "Herstel vóór inbedrijfname.", priority: "hoog", category: "kwaliteit", finding_ids: [findingIdsAll[0]!], capture_ids: [c[18]!] },
          { title: "LS-rek: 6 i.p.v. 8 groepen", description: "Contractuele afwijking; verklaring aannemer en afrekening aanpassen.", priority: "midden", category: "contract", finding_ids: findingIdsAll.slice(2, 3), capture_ids: [c[16]!, c[17]!] },
          { title: "Lichte verzakking klinkers", description: "Herstraten.", priority: "laag", category: "kwaliteit", finding_ids: [findingIdsAll[1]!], capture_ids: [c[4]!] },
        ],
        sections: [
          { key: "overzichtskaart", title: "Overzichtskaart", blocks: [{ type: "map", bbox: null }] },
          {
            key: "bevindingen",
            title: "Bevindingen",
            blocks: [
              { type: "paragraph", text: "Buitenkant: het station staat netjes, de deuren en wanden zijn onbeschadigd en het stationsnummer is aangebracht." },
              { type: "photo_grid", capture_ids: [c[0]!, c[1]!, c[3]!], caption: "Buitenkant en stationsnummer" },
              { type: "finding_ref", finding_index: 1 },
              { type: "photo", capture_id: c[4]!, caption: "Verzakking klinkers rechterzijde" },
              { type: "finding_ref", finding_index: 0 },
              { type: "photo", capture_id: c[18]!, caption: "Kabelkelder: rechter invoer niet afgedicht" },
            ],
          },
          {
            key: "station",
            title: "Stationsbeschrijving",
            blocks: [
              { type: "paragraph", text: "MS-installatie: Eaton Xiria 3K+1T met drie kabelvelden en één trafoveld (HH-zekering 40 A). Transformator: SGB-SMIT DOTE 630/10, 630 kVA, Dyn5." },
              { type: "photo_grid", capture_ids: [c[7]!, c[8]!, c[15]!], caption: "RMU en typeplaten" },
              { type: "photo_grid", capture_ids: [c[9]!, c[10]!, c[11]!, c[12]!], caption: "Velden K1, K2, K3 en T1" },
            ],
          },
          { key: "afrekening", title: "Afrekenonderbouwing", blocks: [{ type: "paragraph", text: "Voorgestelde en bevestigde hoeveelheden met bewijsfoto's:" }] },
        ],
        findings: findingIdsAll.map((id) => ({ id, title: "", description: "", location: null, priority: "midden" as const, category: "kwaliteit" as const, capture_ids: [], recommendation: "" })),
        actions: [],
        station: null,
        quantities: null,
        open_questions: ["Is het meetrapport van de aardingsweerstand (1,8 Ω) formeel ontvangen?", "Waarom zijn er 6 in plaats van 8 LS-groepen uitgevoerd — meerwerk of minderwerk?", "Wanneer wordt de kabelinvoer afgedicht?"],
      }),
      caps,
      [],
      { status: "concept", editor: users.schouwer.id, reviewer: users.projectleider.id },
    );
  }

  // ---------------------------------------------------------------- 3. Nulmeting (in bewerking)
  {
    const t = tpl("nulmeting");
    const start = new Date("2026-08-25T06:15:00Z");
    const seg: LatLon[] = [interpolate(ROUTE, 0.08), interpolate(ROUTE, 0.24)];
    const [insp] = await db
      .insert(inspections)
      .values({
        orgId: org.id,
        projectId: project.id,
        templateId: t.id,
        inspectorId: users.schouwer.id,
        title: "Nulmeting / vooropname Frankhuizerallee 110–126",
        status: "verwerkt",
        startedAt: start,
        endedAt: new Date(start.getTime() + 40 * 60_000),
        weather: { temperatureC: 14.2, precipitationMm: 0, windSpeedKmh: 6, windDirectionDeg: 90, humidity: 88, weatherCode: 1, description: "Overwegend helder", observedAt: start.toISOString(), source: "open-meteo" },
        address: "Frankhuizerallee 110, 8043 XB Zwolle",
        lat: seg[0]![0],
        lon: seg[0]![1],
        createdBy: users.schouwer.id,
      })
      .returning();
    await insertTrack(schouwer, insp!.id, trackPoints(seg, start, 38, 23));
    const at = (f: number) => interpolate(seg, f);
    const caps = await insertCaptures(schouwer, insp!.id, start, t, [
      { key: "nul-01-gevel", at: 3, pos: at(0.05), heading: 10, shot: "Gevels", analysis: analysis("Gevel nr. 112, vooropname.", "Metselwerkgevel zonder zichtbare scheuren of schade.", ["gevel"]) },
      { key: "nul-02-gevel", at: 9, pos: at(0.25), heading: 15, shot: "Gevels", analysis: analysis("Gevel nr. 118 met bestaande verticale scheur.", "Verticale trapscheur van circa 1,2 m door voegen en stenen van het metselwerk (bestaande schade).", ["gevel", "scheur", "bestaande schade"], { possible_findings: [{ category: "omgeving", description: "Bestaande scheur in gevel nr. 118", priority: "laag", confidence: 0.9 }] }) },
      { key: "nul-03-verharding", at: 16, pos: at(0.45), heading: 180, shot: "Verharding", analysis: analysis("Bestaande verzakking in klinkerverharding.", "Verzakking van circa 3 cm over 1,5 m² in het trottoir (bestaande situatie).", ["verharding", "verzakking"]) },
      { key: "nul-04-boom", at: 22, pos: at(0.6), heading: 200, shot: "Groen", analysis: analysis("Straatboom (linde) vooropname.", "Gezonde linde, stamdiameter ca. 45 cm, geen zichtbare schade.", ["boom"]) },
      { key: "nul-05-kolk", at: 28, pos: at(0.75), heading: 90, shot: "Overzicht", analysis: analysis("Kolk en straatmeubilair.", "Straatkolk in klinkerverharding; rooster en kolkrand onbeschadigd.", ["kolk", "straatmeubilair"]) },
      { key: "nul-06-gevel", at: 34, pos: at(0.95), heading: 5, shot: "Gevels", analysis: analysis("Gevel nr. 124 zonder schade.", "Gevel in goede staat.", ["gevel"]) },
    ]);
    const fIds = await insertFindings(schouwer, insp!.id, project.id, caps, [
      { title: "Bestaande scheur gevel Frankhuizerallee 118", description: "Verticale scheur van circa 1,2 m tussen raam en voordeur. Bestaande schade vóór aanvang werkzaamheden.", category: "omgeving", priority: "laag", captureIdx: [1], recommendation: "Vastleggen in de vooropname; scheurmeter plaatsen tijdens uitvoering." },
      { title: "Bestaande verzakking trottoir", description: "Verzakking van circa 3 cm over 1,5 m² ter hoogte van nr. 120.", category: "omgeving", priority: "laag", captureIdx: [2], recommendation: "Niet toerekenen aan het werk; wel meenemen in het herstel." },
    ]);
    void fIds;
    await answerAll(schouwer, insp!.id, t, { 1: { value: "ja", caps: [caps[2]!] }, 2: { value: "ja", caps: [caps[1]!] }, 5: { value: "ja" } }, new Date(start.getTime() + 38 * 60_000));
    await makeReport(
      schouwer,
      insp!.id,
      () => ({
        title: "Vooropname Frankhuizerallee 110–126",
        summary: "Op 25 augustus 2026 is de omgeving langs het tracé (Frankhuizerallee 110–126) vóór uitvoering vastgelegd. Er is bestaande schade geconstateerd aan de gevel van nr. 118 (verticale scheur) en een bestaande verzakking in het trottoir. De overige gevels, bomen en het straatmeubilair zijn onbeschadigd.",
        key_points: [{ title: "Bestaande gevelscheur nr. 118", description: "Scheurmeter plaatsen tijdens uitvoering.", priority: "laag", category: "omgeving", finding_ids: ["0"], capture_ids: [caps[1]!] }],
        sections: [
          { key: "bevindingen", title: "Bevindingen", blocks: [{ type: "finding_ref", finding_index: 0 }, { type: "photo", capture_id: caps[1]!, caption: "Gevel nr. 118 met bestaande scheur" }, { type: "finding_ref", finding_index: 1 }, { type: "photo", capture_id: caps[2]!, caption: "Bestaande verzakking trottoir" }, { type: "photo_grid", capture_ids: [caps[0]!, caps[3]!, caps[4]!, caps[5]!], caption: "Overige vooropnamefoto's" }] },
        ],
        findings: [],
        actions: [],
        station: null,
        quantities: null,
        open_questions: ["Zijn de bewoners van nr. 118 geïnformeerd over de scheurmeter?"],
      }),
      caps,
      [],
      { status: "in_bewerking", editor: users.schouwer.id, reviewer: users.projectleider.id },
    );
  }

  // ---------------------------------------------------------------- 4. Losse calamiteitenschouw (ter review)
  {
    const t = tpl("calamiteit");
    const start = new Date("2026-09-22T13:40:00Z");
    const place: LatLon = [52.50752, 6.09261];
    const [insp] = await db
      .insert(inspections)
      .values({
        orgId: org.id,
        projectId: null,
        templateId: t.id,
        inspectorId: users.schouwer.id,
        title: "Graafschade LS-kabel Assendorperstraat",
        status: "verwerkt",
        startedAt: start,
        endedAt: new Date(start.getTime() + 35 * 60_000),
        weather: { temperatureC: 16.0, precipitationMm: 1.4, windSpeedKmh: 22, windDirectionDeg: 260, humidity: 91, weatherCode: 63, description: "Regen", observedAt: start.toISOString(), source: "open-meteo" },
        address: "Assendorperstraat 64, 8012 DK Zwolle",
        lat: place[0],
        lon: place[1],
        createdBy: users.schouwer.id,
      })
      .returning();
    const around = (i: number): LatLon => [place[0] + Math.sin(i) * 0.00005, place[1] + Math.cos(i) * 0.00007];
    await insertTrack(schouwer, insp!.id, trackPoints([around(0), around(1), around(2)], start, 32, 31));
    const caps = await insertCaptures(schouwer, insp!.id, start, t, [
      { key: "cal-01-overzicht", at: 2, pos: around(0.2), heading: 270, shot: "Overzicht situatie", analysis: analysis("Overzicht graafschade met graafmachine.", "Graafmachine van een derde partij naast een open ontgraving in het trottoir.", ["graafschade", "graafmachine"], { privacy_flags: { persons_recognizable: true, license_plates_visible: false, notes: "Machinist herkenbaar in cabine" } }) },
      { key: "cal-02-schade", at: 5, pos: around(0.4), heading: 180, shot: "Schade", analysis: analysis("Beschadigde LS-kabel in de ontgraving.", "Uit de grond getrokken LS-kabel; mantel over circa 1 m beschadigd, aders deels blootliggend.", ["kabel", "schade", "LS"], { possible_findings: [{ category: "veiligheid", description: "Blootliggende aders LS-kabel — direct afschermen", priority: "hoog", confidence: 0.9 }] }) },
      { key: "cal-03-afzetting", at: 9, pos: around(0.6), heading: 90, shot: "Genomen maatregelen", analysis: analysis("Afzetting met hekken en pylonen.", "Werkvak afgezet met rood-witte hekken.", ["afzetting", "veiligheid"]) },
      { key: "cal-04-kraan", at: 12, pos: around(0.8), heading: 300, analysis: analysis("Graafmachine van de veroorzaker.", "Mobiele minigraver; bedrijfsnaam op de machine.", ["graafmachine"]) },
      { key: "cal-05-herstel", at: 30, pos: around(1), heading: 200, analysis: analysis("Noodherstel met verbindingsmof.", "Tijdelijke mof geplaatst, sleuf nog open.", ["herstel", "mof"]) },
      { type: "audio", blobUrl: "static:/demo/spraak-calamiteit.wav", mime: "audio/wav", durationMs: 45_000, at: 4, pos: around(0.3) },
    ]);
    await insertTranscript(schouwer, insp!.id, caps[5]!, new Date(start.getTime() + 4 * 60_000), [
      { from: 0, to: 15, text: "Graafschade aan LS-kabel bij Assendorperstraat 64, aders liggen bloot, situatie direct afgezet." },
      { from: 15, to: 30, text: "Veroorzaker is een aannemer voor glasvezel, geen KLIC-melding getoond. Gegevens machinist genoteerd." },
      { from: 30, to: 45, text: "Storingsdienst is gebeld om kwart voor vier, zes aansluitingen zonder spanning." },
    ]);
    const fIds = await insertFindings(schouwer, insp!.id, null, caps, [
      { title: "Blootliggende aders beschadigde LS-kabel", description: "Door graafwerk van een derde is de mantel van de LS-kabel beschadigd; aders liggen bloot.", category: "veiligheid", priority: "hoog", captureIdx: [1], recommendation: "Kabel direct afschermen, spanningsloos maken en definitief herstellen met mof.", status: "opgelost" },
      { title: "Graafwerk zonder KLIC-melding", description: "De veroorzaker kon geen KLIC-melding tonen.", category: "contract", priority: "hoog", captureIdx: [0, 3], recommendation: "Schade verhalen op de veroorzaker; melding bij Agentschap Telecom (WIBON).", source: "transcript" },
    ]);
    await db.insert(actions).values([
      { orgId: org.id, inspectionId: insp!.id, projectId: null, description: "Schadeclaim opstellen richting veroorzaker", owner: "Projectleider", dueDate: "2026-10-01", status: "open", findingIds: [fIds[1]!], source: "handmatig", createdBy: users.projectleider.id },
      { orgId: org.id, inspectionId: insp!.id, projectId: null, description: "Definitief herstel LS-kabel met verbindingsmof", owner: "Storingsdienst Enexis", dueDate: "2026-09-23", status: "gereed", findingIds: [fIds[0]!], source: "handmatig", createdBy: users.schouwer.id },
    ]);
    await answerAll(schouwer, insp!.id, t, { 0: { value: "ja", caps: [caps[2]!] }, 1: { value: "ja" }, 2: { value: 6 }, 3: { value: "ja" }, 4: { value: "ja" }, 5: { value: "Afgezet, storingsdienst ingeschakeld, noodherstel met mof." } }, new Date(start.getTime() + 33 * 60_000));
    await makeReport(
      schouwer,
      insp!.id,
      (c, f) => ({
        title: "Calamiteitenverslag graafschade Assendorperstraat",
        summary: "Op 22 september 2026 is bij Assendorperstraat 64 een LS-kabel beschadigd door graafwerk van een derde, die geen KLIC-melding kon tonen. De situatie is direct afgezet; zes aansluitingen waren zonder spanning. De storingsdienst heeft een noodherstel met mof uitgevoerd. De schade wordt verhaald op de veroorzaker.",
        key_points: [
          { title: "Blootliggende aders (opgelost)", description: "Direct afgezet en hersteld.", priority: "hoog", category: "veiligheid", finding_ids: ["0"], capture_ids: [c[1]!] },
          { title: "Geen KLIC-melding veroorzaker", description: "Schade verhalen, melding WIBON.", priority: "hoog", category: "contract", finding_ids: ["1"], capture_ids: [c[0]!] },
        ],
        sections: [
          { key: "bevindingen", title: "Bevindingen en tijdlijn", blocks: [{ type: "paragraph", text: "15:42 – aankomst ter plaatse; graafmachine van een derde naast open ontgraving." }, { type: "photo", capture_id: c[0]!, caption: "Overzicht graafschade" }, { type: "finding_ref", finding_index: 0 }, { type: "photo", capture_id: c[1]!, caption: "Beschadigde LS-kabel" }, { type: "paragraph", text: "15:49 – werkvak afgezet; 15:45 storingsdienst gebeld." }, { type: "photo", capture_id: c[2]!, caption: "Afzetting" }, { type: "finding_ref", finding_index: 1 }, { type: "paragraph", text: "16:10 – noodherstel met verbindingsmof gereed." }, { type: "photo", capture_id: c[4]!, caption: "Noodherstel" }] },
        ],
        findings: f.map((id) => ({ id, title: "", description: "", location: null, priority: "hoog" as const, category: "veiligheid" as const, capture_ids: [], recommendation: "" })),
        actions: [],
        station: null,
        quantities: null,
        open_questions: ["Is de melding bij het Agentschap Telecom gedaan?"],
      }),
      caps,
      fIds,
      { status: "ter_review", editor: users.schouwer.id, reviewer: users.projectleider.id },
    );
  }

  // ---------------------------------------------------------------- Smart glasses device + inbox items
  {
    const { token, prefix } = newDeviceToken();
    const [device] = await db
      .insert(devices)
      .values({ orgId: org.id, userId: users.schouwer.id, name: "Ray-Ban Meta — Sanne", kind: "meta-rayban", tokenHash: hashToken(token), tokenPrefix: prefix, lastSeenAt: new Date(), createdBy: users.admin.id })
      .returning();
    const t0 = new Date("2026-09-24T09:05:00Z");
    for (const [i, key] of ["glasses-01", "glasses-02"].entries()) {
      await db.insert(captures).values({
        orgId: org.id,
        inspectionId: null,
        type: "photo",
        blobUrl: `static:/demo/${key}.jpg`,
        thumbUrl: `static:/demo/thumbs/${key}.jpg`,
        mime: "image/jpeg",
        capturedAt: new Date(t0.getTime() + i * 90_000),
        source: "glasses-ingest",
        locationSource: "none",
        tags: ["smart-glasses"],
        deviceId: device!.id,
        createdBy: users.schouwer.id,
      });
    }
    summary.push(`Apparaattoken demo-bril (schouwer): ${token}`);
  }
  return summary;
}

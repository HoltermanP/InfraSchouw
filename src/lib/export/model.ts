import "server-only";
import sharp from "sharp";
import {
  ACTION_STATUS_LABELS,
  ASBUILT_STATUS_LABELS,
  BILLING_EVIDENCE_STATUS_LABELS,
  CAPTURE_TYPE_LABELS,
  FINDING_CATEGORY_LABELS,
  FINDING_STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  REPORT_STATUS_LABELS,
  STATION_HOUSING_LABELS,
  STATION_TYPE_LABELS,
  type Priority,
  type ReportStatus,
} from "@/lib/domain";
import { formatRd, formatWgs84, headingLabel } from "@/lib/geo/rd";
import { formatWeather } from "@/lib/geo/weather";
import { fmtDate, fmtDateTime, fmtNumber, fmtCurrency, fmtTime } from "@/lib/format";
import { getObjectBuffer } from "@/lib/storage";
import { getSections } from "@/lib/report/doc";
import type { DataBlockKind } from "@/lib/report/doc";
import type { InspectionContext } from "@/lib/report/context";
import type { ReportMeta, TiptapDoc, TiptapNode } from "@/lib/report/types";
import { FIELD_SOURCE_LABELS } from "@/lib/station/types";
import { getPath } from "@/lib/station/merge";
import { overviewMapInput, renderStaticMap } from "./static-map";
import { answerLabel } from "@/components/inspections/checklist-labels";

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
export type Img = { data: Buffer; format: "jpg" | "png"; width: number; height: number };
export type PhotoRef = { captureId: string; nr: number | null; caption: string; note: string; meta: string; image: Img | null };
export type TableBlock = { type: "table"; columns: string[]; rows: string[][]; caption?: string | null; widths?: number[]; colorColumn?: { index: number; colors: (string | null)[] } };

export type Block =
  | { type: "paragraph"; runs: Run[] }
  | { type: "heading"; text: string; level: number }
  | { type: "list"; ordered: boolean; items: Run[][] }
  | { type: "quote"; runs: Run[] }
  | { type: "photo"; photo: PhotoRef }
  | { type: "photoGrid"; photos: PhotoRef[]; caption: string }
  | { type: "map"; image: Img | null; caption: string }
  | { type: "finding"; nr: number; title: string; description: string; recommendation: string | null; priority: Priority; category: string; status: string; photoNrs: (number | null)[]; coords: string | null; aiProposal: boolean }
  | TableBlock
  | { type: "signatures"; participants: { name: string; organization: string | null; role: string | null; signedAt: string | null; signature: Img | null }[] }
  | { type: "note"; text: string };

export type Section = { key: string; number: string; title: string; blocks: Block[] };

export type ReportModel = {
  title: string;
  subtitle: string;
  status: ReportStatus;
  statusLabel: string;
  versionNumber: number | null;
  generatedAt: string;
  isDraft: boolean;
  aiNotice: boolean;
  branding: { companyName: string; primaryColor: string; accentColor: string; footerText: string; logo: Img | null };
  cover: { label: string; value: string }[];
  sections: Section[];
  inspectionId: string;
};

async function loadImageRaw(url: string | null | undefined, maxDim = 1400, forcePng = false): Promise<Img | null> {
  if (!url) return null;
  const obj = await getObjectBuffer(url);
  if (!obj) return null;
  try {
    const pipeline = sharp(obj.buffer).rotate().resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });
    const out = forcePng ? await pipeline.png().toBuffer({ resolveWithObject: true }) : await pipeline.jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
    return { data: out.data, format: forcePng ? "png" : "jpg", width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

function runsOf(node: TiptapNode): Run[] {
  const out: Run[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === "text") {
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      out.push({ text: n.text ?? "", bold: marks.has("bold"), italic: marks.has("italic"), underline: marks.has("underline") });
    } else if (n.type === "hardBreak") out.push({ text: "\n" });
    else n.content?.forEach(walk);
  };
  walk(node);
  return out;
}

function tableFromNode(node: TiptapNode): TableBlock {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => runsOf(cell).map((r) => r.text).join("")));
  const [head, ...body] = rows;
  return { type: "table", columns: head ?? [], rows: body };
}

/**
 * Build the format-neutral report model from the inspection context and a
 * report version (content + meta).
 */
export async function buildReportModel(
  ctx: InspectionContext,
  content: TiptapDoc,
  meta: ReportMeta,
  opts: { versionNumber: number | null; status: ReportStatus; mapSnapshotUrl?: string | null; loadImages?: boolean },
): Promise<ReportModel> {
  const withImages = opts.loadImages !== false;
  const loadImage = (url: string | null | undefined, maxDim?: number, forcePng?: boolean) => (withImages ? loadImageRaw(url, maxDim, forcePng) : Promise.resolve(null));
  const captureById = new Map(ctx.captures.map((c) => [c.id, c]));
  const imageCache = new Map<string, Promise<Img | null>>();
  const photoRef = async (captureId: string, caption?: string, note?: string): Promise<PhotoRef | null> => {
    const c = captureById.get(captureId);
    if (!c) return null;
    const src = c.type === "video" ? (c.meta.keyframes?.[0]?.url ?? c.thumbUrl) : c.blobUrl;
    if (!imageCache.has(captureId)) imageCache.set(captureId, loadImage(src));
    const metaParts = [
      fmtDateTime(c.capturedAt),
      c.rdX !== null ? `RD ${Math.round(c.rdX)}, ${Math.round(c.rdY!)}` : null,
      c.heading !== null ? `richting ${headingLabel(c.heading)}` : null,
      c.type === "video" ? "(still uit video)" : null,
    ].filter(Boolean);
    return { captureId, nr: c.seq, caption: caption || c.analysis?.caption || c.note || "", note: note ?? "", meta: metaParts.join(" · "), image: await imageCache.get(captureId)! };
  };
  const findingNr = new Map(ctx.findings.map((f, i) => [f.id, i + 1]));

  const dataBlock = async (kind: DataBlockKind): Promise<Block[]> => {
    switch (kind) {
      case "keyPoints": {
        if (meta.keyPoints.length === 0) return [{ type: "note", text: "Geen aandachtspunten vastgelegd." }];
        return [
          {
            type: "table",
            columns: ["Prio", "Categorie", "Aandachtspunt", "Verwijzing"],
            widths: [12, 16, 50, 22],
            rows: meta.keyPoints.map((k) => [
              PRIORITY_LABELS[k.priority],
              FINDING_CATEGORY_LABELS[k.category],
              `${k.title}${k.description ? ` — ${k.description}` : ""}`,
              [
                k.findingIds.map((id) => (findingNr.get(id) ? `B${findingNr.get(id)}` : null)).filter(Boolean).join(", "),
                k.captureIds.map((id) => captureById.get(id)?.seq).filter(Boolean).map((n) => `foto ${n}`).join(", "),
              ]
                .filter(Boolean)
                .join(" · "),
            ]),
            colorColumn: { index: 0, colors: meta.keyPoints.map((k) => PRIORITY_COLORS[k.priority]) },
          },
        ];
      }
      case "findings":
        return ctx.findings.map((f) => ({
          type: "finding" as const,
          nr: findingNr.get(f.id)!,
          title: f.title,
          description: f.description,
          recommendation: f.recommendation,
          priority: f.priority,
          category: FINDING_CATEGORY_LABELS[f.category],
          status: FINDING_STATUS_LABELS[f.status],
          photoNrs: f.captureIds.map((id) => captureById.get(id)?.seq ?? null),
          coords: f.lat !== null ? formatWgs84(f.lat, f.lon) : null,
          aiProposal: !f.aiAccepted,
        }));
      case "actions":
        if (ctx.actions.length === 0) return [{ type: "note", text: "Geen actiepunten." }];
        return [
          {
            type: "table",
            columns: ["#", "Wat", "Wie", "Wanneer", "Status", "Bevinding"],
            widths: [5, 45, 16, 12, 10, 12],
            rows: ctx.actions.map((a, i) => [
              String(i + 1),
              a.description,
              a.owner ?? "—",
              a.dueDate ? fmtDate(a.dueDate) : "—",
              ACTION_STATUS_LABELS[a.status],
              a.findingIds.map((id) => (findingNr.get(id) ? `B${findingNr.get(id)}` : "")).filter(Boolean).join(", ") || "—",
            ]),
          },
        ];
      case "checklist": {
        if (ctx.template.checklist.length === 0) return [{ type: "note", text: "Dit schouwtype heeft geen checklist." }];
        return [
          {
            type: "table",
            columns: ["Vraag", "Antwoord", "Toelichting", "Foto"],
            widths: [44, 14, 30, 12],
            rows: ctx.template.checklist.map((item) => {
              const a = ctx.answers.find((x) => x.itemId === item.id);
              const skip = ctx.inspection.skipped.find((s) => s.kind === "checklist" && s.refId === item.id);
              return [
                item.question,
                a?.skippedReason || skip ? "Overgeslagen" : answerLabel(a?.value ?? null),
                a?.skippedReason ?? skip?.reason ?? a?.note ?? "",
                (a?.captureIds ?? []).map((id) => captureById.get(id)?.seq).filter(Boolean).join(", "),
              ];
            }),
          },
        ];
      }
      case "photoRegister": {
        const photos = ctx.captures.filter((c) => ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport);
        if (photos.length === 0) return [{ type: "note", text: "Geen foto's." }];
        return [
          { type: "heading", text: "Fotoregister", level: 3 },
          {
            type: "table",
            columns: ["Nr", "Tijd", "RD x / y", "WGS84", "Richting", "Bijschrift"],
            widths: [6, 9, 18, 20, 11, 36],
            rows: photos.map((c) => [
              String(c.seq ?? "—"),
              fmtTime(c.capturedAt),
              formatRd(c.rdX, c.rdY).replace("X ", "").replace(" · Y ", " / "),
              formatWgs84(c.lat, c.lon),
              headingLabel(c.heading),
              `${c.type !== "photo" ? `[${CAPTURE_TYPE_LABELS[c.type]}] ` : ""}${c.analysis?.caption ?? c.note ?? ""}`,
            ]),
          },
        ];
      }
      case "measurements":
        if (ctx.measurements.length === 0) return [];
        return [
          { type: "heading", text: "Metingen", level: 3 },
          {
            type: "table",
            columns: ["Tijd", "Meting", "Waarde", "Foto", "Locatie"],
            widths: [10, 40, 15, 10, 25],
            rows: ctx.measurements.map((m) => [
              fmtTime(m.measuredAt),
              `${m.label}${m.source === "ai" ? " (uit spraak)" : ""}`,
              `${fmtNumber(m.value)} ${m.unit}`,
              m.photoCaptureId ? String(captureById.get(m.photoCaptureId)?.seq ?? "") : "",
              formatWgs84(m.lat, m.lon),
            ]),
          },
        ];
      case "transcript":
        if (ctx.segments.length === 0) return [];
        return [
          { type: "heading", text: "Transcriptie gesproken tekst", level: 3 },
          ...ctx.segments.map((s) => ({
            type: "paragraph" as const,
            runs: [
              { text: `${fmtTime(s.startAt, true)}  `, bold: true },
              { text: s.text },
              ...(s.captureIds.length ? [{ text: `  (foto ${s.captureIds.map((id) => captureById.get(id)?.seq).filter(Boolean).join(", ")})`, italic: true }] : []),
            ],
          })),
        ];
      case "participants": {
        const participants = await Promise.all(
          ctx.participants.map(async (p) => ({
            name: p.name,
            organization: p.organization,
            role: p.role,
            signedAt: p.signedAt ? fmtDateTime(p.signedAt) : null,
            signature: await loadImage(p.signatureUrl, 600, true),
          })),
        );
        return [{ type: "heading", text: "Deelnemers", level: 3 }, ...(participants.length ? [{ type: "signatures" as const, participants }] : [{ type: "note" as const, text: "Geen deelnemers vastgelegd." }])];
      }
      case "station": {
        if (!ctx.station) return [];
        const d = ctx.stationDescription?.data;
        const v = d?.values;
        const src = (path: string) => {
          const m = d?.fieldMeta[path];
          return m ? `${FIELD_SOURCE_LABELS[m.source]}${m.source === "ai" && m.confidence !== null ? ` (${Math.round(m.confidence * 100)}%)` : ""}` : "";
        };
        const row = (label: string, path: string, unit = ""): string[] => {
          const value = v ? getPath(v, path) : null;
          const text = value === null || value === undefined || value === "" ? "—" : Array.isArray(value) ? value.join(", ") || "—" : `${value}${unit}`;
          return [label, text, src(path)];
        };
        const blocks: Block[] = [
          {
            type: "table",
            caption: "Stationsgegevens",
            columns: ["Kenmerk", "Waarde", "Bron"],
            widths: [35, 45, 20],
            rows: [
              ["Stationsnummer", ctx.station.code, "Stationsregister"],
              ["Naam", ctx.station.name, "Stationsregister"],
              ["Type", STATION_TYPE_LABELS[ctx.station.stationType], "Stationsregister"],
              ["Behuizing", STATION_HOUSING_LABELS[ctx.station.housing], "Stationsregister"],
              ["Adres", ctx.station.address ?? "—", "Stationsregister"],
              ...(v
                ? [
                    row("Buitenkant — staat", "exterior.staat"),
                    row("Bereikbaarheid", "exterior.bereikbaarheid"),
                    row("MS-installatie fabrikant", "mv_switchgear.fabrikant"),
                    row("MS-installatie type", "mv_switchgear.type"),
                    row("Bouwjaar RMU", "mv_switchgear.bouwjaar"),
                    row("Serienummer RMU", "mv_switchgear.serienummer"),
                    row("Nominale spanning", "mv_switchgear.nominale_spanning_kv", " kV"),
                    row("Isolatiemedium", "mv_switchgear.isolatiemedium"),
                    row("Aantal velden", "mv_switchgear.aantal_velden"),
                    row("LS-verdeler", "lv_board.type"),
                    row("Aantal LS-groepen", "lv_board.aantal_groepen"),
                    row("MS-eindsluitingen", "cables.mv_eindsluitingen"),
                    row("Kabelinvoer afdichting", "cables.invoer_afdichting"),
                    row("Aarding", "earthing.beschrijving"),
                    row("RTU / automatisering", "automation.rtu"),
                    row("Veiligheid aanwezig", "safety.aanwezig"),
                    row("Veiligheid ontbrekend", "safety.ontbrekend"),
                    row("Algemene staat", "overall_condition"),
                  ]
                : []),
            ],
          },
        ];
        if (v?.mv_switchgear.velden.length) {
          blocks.push({
            type: "table",
            caption: "MS-velden",
            columns: ["Positie", "Functie", "Aanduiding", "Beveiliging", "Kabel"],
            rows: v.mv_switchgear.velden.map((f) => [f.positie ?? "—", f.functie ?? "—", f.aanduiding ?? "—", f.beveiliging ?? "—", f.kabel_aangesloten === null ? "—" : f.kabel_aangesloten ? "Ja" : "Nee"]),
          });
        }
        if (v?.transformers.length) {
          blocks.push({
            type: "table",
            caption: "Transformatoren",
            columns: ["Fabrikant", "Type", "Vermogen", "Spanning", "Schakelgroep", "Bouwjaar", "Serienr."],
            rows: v.transformers.map((t) => [
              t.fabrikant ?? "—",
              t.type ?? "—",
              t.vermogen_kva !== null ? `${t.vermogen_kva} kVA` : "—",
              t.primair_kv !== null ? `${t.primair_kv} kV / ${t.secundair_v ?? "?"} V` : "—",
              t.schakelgroep ?? "—",
              t.bouwjaar !== null ? String(t.bouwjaar) : "—",
              t.serienummer ?? "—",
            ]),
          });
        }
        if (v?.lv_board.groepen.length) {
          blocks.push({ type: "table", caption: "LS-groepen", columns: ["Groep", "Zekering", "Aanduiding"], rows: v.lv_board.groepen.map((g) => [g.nr ?? "—", g.zekering_a !== null ? `${g.zekering_a} A` : "—", g.aanduiding ?? "—"]) });
        }
        if (v?.remarks) blocks.push({ type: "paragraph", runs: [{ text: "Opmerkingen: ", bold: true }, { text: v.remarks }] });
        // Nameplate photos next to the description.
        const plates = ctx.captures.filter((c) => c.analysis?.nameplate && !c.hiddenInReport).slice(0, 4);
        if (plates.length) {
          const photos = (await Promise.all(plates.map((c) => photoRef(c.id, `Typeplaat: ${c.analysis?.caption ?? ""}`)))).filter((p): p is PhotoRef => Boolean(p));
          blocks.push({ type: "photoGrid", photos, caption: "Typeplaten" });
        }
        if (!v) blocks.push({ type: "note", text: "Er is nog geen installatiebeschrijving vastgelegd." });
        return blocks;
      }
      case "asbuilt": {
        const rows = ctx.asbuilt?.rows ?? [];
        if (!ctx.expectedConfig) return [{ type: "note", text: "Er is geen verwachte configuratie (ontwerp) vastgelegd; as-built-check niet uitgevoerd." }];
        if (rows.length === 0) return [{ type: "note", text: "As-built-check nog niet uitgevoerd." }];
        return [
          {
            type: "table",
            caption: "As-built-check: verwacht (ontwerp) ↔ aangetroffen",
            columns: ["Kenmerk", "Verwacht", "Aangetroffen", "Resultaat", "Bewijs (foto)"],
            widths: [26, 20, 20, 16, 18],
            rows: rows.map((r) => [r.label, r.expected ?? "—", r.found ?? "—", ASBUILT_STATUS_LABELS[r.status], r.captureIds.map((id) => captureById.get(id)?.seq).filter(Boolean).join(", ") || "—"]),
            colorColumn: { index: 3, colors: rows.map((r) => (r.status === "conform" ? "#16a34a" : r.status === "afwijkend" ? "#dc2626" : "#6b7280")) },
          },
        ];
      }
      case "billing": {
        if (ctx.billingEvidence.length === 0) return [{ type: "note", text: "Geen afrekenbewijs vastgelegd bij deze schouw." }];
        const itemById = new Map(ctx.billingItems.map((b) => [b.id, b]));
        return [
          {
            type: "table",
            caption: "Aangetroffen hoeveelheden per afrekenpost",
            columns: ["Post", "Omschrijving", "Hoeveelheid", "Bedrag", "Status", "Foto's"],
            widths: [8, 38, 14, 14, 12, 14],
            rows: ctx.billingEvidence.map((e) => {
              const item = itemById.get(e.billingItemId);
              return [
                item?.code ?? "?",
                item?.description ?? "",
                `${fmtNumber(e.quantity)} ${item?.unit ?? ""}`,
                item ? fmtCurrency(e.quantity * item.unitPrice) : "—",
                BILLING_EVIDENCE_STATUS_LABELS[e.status],
                e.captureIds.map((id) => captureById.get(id)?.seq).filter(Boolean).join(", "),
              ];
            }),
          },
        ];
      }
    }
  };

  let mapImage: Img | null | undefined;
  const mapBlock = async (): Promise<Block> => {
    if (!withImages) mapImage = null;
    if (mapImage === undefined) {
      mapImage = opts.mapSnapshotUrl ? await loadImage(opts.mapSnapshotUrl, 2000, true) : null;
      if (!mapImage) {
        const png = await renderStaticMap({ ...overviewMapInput(ctx, (id) => findingNr.get(id)), area: null }).catch(() => null);
        mapImage = png ? { data: png, format: "png", width: 1600, height: 1000 } : null;
      }
    }
    return {
      type: "map",
      image: mapImage,
      caption: ctx.template.tracksRoute
        ? "Overzichtskaart: genummerde fotolocaties (blauw), bevindingen (gekleurd naar prioriteit, nummer = B-nummer) en gelopen GPS-track (rood)."
        : "Overzichtskaart: locatie van de schouw.",
    };
  };

  const convert = async (nodes: TiptapNode[]): Promise<Block[]> => {
    const out: Block[] = [];
    for (const n of nodes) {
      switch (n.type) {
        case "paragraph": {
          const runs = runsOf(n);
          if (runs.some((r) => r.text.trim())) out.push({ type: "paragraph", runs });
          break;
        }
        case "heading":
          out.push({ type: "heading", text: runsOf(n).map((r) => r.text).join(""), level: Number(n.attrs?.level ?? 3) });
          break;
        case "bulletList":
        case "orderedList":
          out.push({ type: "list", ordered: n.type === "orderedList", items: (n.content ?? []).map((li) => runsOf(li)) });
          break;
        case "blockquote":
          out.push({ type: "quote", runs: runsOf(n) });
          break;
        case "photo": {
          const p = await photoRef(String(n.attrs?.captureId), String(n.attrs?.caption ?? ""), String(n.attrs?.note ?? ""));
          if (p && !captureById.get(p.captureId)?.hiddenInReport) out.push({ type: "photo", photo: p });
          break;
        }
        case "photoGrid": {
          const ids = (n.attrs?.captureIds as string[] | undefined) ?? [];
          const photos = (await Promise.all(ids.filter((id) => !captureById.get(id)?.hiddenInReport).map((id) => photoRef(id)))).filter((p): p is PhotoRef => Boolean(p));
          if (photos.length) out.push({ type: "photoGrid", photos, caption: String(n.attrs?.caption ?? "") });
          break;
        }
        case "mapSnapshot":
          out.push(await mapBlock());
          break;
        case "findingRef": {
          const f = ctx.findings.find((x) => x.id === n.attrs?.findingId);
          if (f)
            out.push({
              type: "finding",
              nr: findingNr.get(f.id)!,
              title: f.title,
              description: f.description,
              recommendation: f.recommendation,
              priority: f.priority,
              category: FINDING_CATEGORY_LABELS[f.category],
              status: FINDING_STATUS_LABELS[f.status],
              photoNrs: f.captureIds.map((id) => captureById.get(id)?.seq ?? null),
              coords: f.lat !== null ? formatWgs84(f.lat, f.lon) : null,
              aiProposal: !f.aiAccepted,
            });
          break;
        }
        case "dataBlock":
          out.push(...(await dataBlock(n.attrs?.kind as DataBlockKind)));
          break;
        case "table":
          out.push(tableFromNode(n));
          break;
        default:
          if (n.content) out.push(...(await convert(n.content)));
      }
    }
    return out;
  };

  const sections: Section[] = [];
  let i = 0;
  for (const s of getSections(content)) {
    i++;
    sections.push({ key: String(s.attrs?.key), number: String(i), title: String(s.attrs?.title ?? ""), blocks: await convert(s.content ?? []) });
  }

  const b = ctx.org.settings.branding;
  const aiNotice = meta.keyPoints.some((k) => k.source === "ai" && !k.accepted) || ctx.findings.some((f) => !f.aiAccepted);
  const participants = ctx.participants.map((p) => [p.name, p.organization].filter(Boolean).join(" (") + (p.organization ? ")" : "")).join(", ");
  return {
    title: ctx.report?.title ?? ctx.inspection.title,
    subtitle: ctx.template.name,
    status: opts.status,
    statusLabel: REPORT_STATUS_LABELS[opts.status],
    versionNumber: opts.versionNumber,
    generatedAt: fmtDateTime(new Date()),
    isDraft: opts.status !== "definitief",
    aiNotice,
    branding: {
      companyName: b.companyName || ctx.org.name,
      primaryColor: b.primaryColor,
      accentColor: b.accentColor,
      footerText: b.footerText,
      logo: await loadImage(b.logoUrl, 600, true),
    },
    cover: [
      { label: "Project", value: ctx.project ? `${ctx.project.number} – ${ctx.project.name}` : "Losse schouw" },
      { label: "Opdrachtgever", value: ctx.project?.client ?? "—" },
      { label: "Schouwtype", value: ctx.template.name },
      ...(ctx.station ? [{ label: "MS-station", value: `${ctx.station.code} – ${ctx.station.name}` }] : []),
      { label: "Datum / tijd", value: `${fmtDateTime(ctx.inspection.startedAt)}${ctx.inspection.endedAt ? ` – ${fmtTime(ctx.inspection.endedAt)}` : ""}` },
      { label: "Locatie", value: ctx.inspection.address ?? (ctx.inspection.lat !== null ? formatWgs84(ctx.inspection.lat, ctx.inspection.lon) : "—") },
      { label: "Schouwer", value: ctx.inspector?.name ?? "—" },
      { label: "Deelnemers", value: participants || "—" },
      { label: "Weer", value: formatWeather(ctx.inspection.weather) },
      { label: "Versie", value: opts.versionNumber ? String(opts.versionNumber) : "—" },
      { label: "Status", value: REPORT_STATUS_LABELS[opts.status] },
    ],
    sections,
    inspectionId: ctx.inspection.id,
  };
}

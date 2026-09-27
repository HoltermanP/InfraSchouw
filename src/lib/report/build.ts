import type { ReportBlock, ReportDraft } from "../ai/schemas";
import { FINDING_CATEGORY_LABELS, PRIORITY_LABELS, type FindingCategory } from "../domain";
import { formatWeather } from "../geo/weather";
import {
  dataBlock,
  doc,
  findingRef,
  getSections,
  mapSnapshot,
  paragraph,
  paragraphs,
  photo,
  photoGrid,
  referencedCaptureIds,
  section,
  sectionHash,
  table,
  heading,
} from "./doc";
import type { KeyPoint, OpenQuestion, ReportMeta, SectionState, TiptapDoc, TiptapNode } from "./types";

/**
 * Minimal structural view of the inspection context needed to build a
 * report document (kept structural so it is unit-testable without a DB).
 */
export type BuildContext = {
  inspection: { title: string; startedAt: Date; endedAt: Date | null; address: string | null; weather: Parameters<typeof formatWeather>[0] };
  template: { name: string; purposeText: string; isStation: boolean; isBilling: boolean; sections: { key: string; title: string }[] };
  project: { number: string; name: string; client: string | null; contractForm: string } | null;
  station: { code: string; name: string } | null;
  captures: {
    id: string;
    type: string;
    seq: number | null;
    hiddenInReport: boolean;
    capturedAt: Date;
    note: string | null;
    analysis: { caption: string; description?: string; station_component?: string | null } | null;
    shotId: string | null;
  }[];
  findings: { id: string; title: string; category: FindingCategory; priority: "hoog" | "midden" | "laag"; captureIds: string[]; lat: number | null; lon: number | null; description: string }[];
  org: { settings: { export: { findingsGrouping: "thema" | "locatie" } } };
  billingItems: { code: string }[];
};

const DATA_SECTION_BLOCKS: Record<string, TiptapNode[]> = {
  overzichtskaart: [mapSnapshot(null)],
  station: [dataBlock("station"), dataBlock("asbuilt")],
  afrekening: [dataBlock("billing")],
  actiepunten: [dataBlock("actions")],
  checklist: [dataBlock("checklist")],
  bijlagen: [dataBlock("photoRegister"), dataBlock("measurements"), dataBlock("transcript"), dataBlock("participants")],
};

export function templateSections(ctx: BuildContext): { key: string; title: string }[] {
  const secs = ctx.template.sections.length
    ? ctx.template.sections
    : [
        { key: "samenvatting", title: "Samenvatting" },
        { key: "doel_scope", title: "Doel en scope" },
        { key: "overzichtskaart", title: "Overzichtskaart" },
        { key: "bevindingen", title: "Bevindingen" },
        { key: "actiepunten", title: "Actiepunten" },
        { key: "checklist", title: "Checklist" },
        { key: "bijlagen", title: "Bijlagen" },
      ];
  return secs.filter((s) => (s.key !== "station" || ctx.template.isStation) && (s.key !== "afrekening" || ctx.template.isBilling));
}

function photoCaption(c: BuildContext["captures"][number]): string {
  return c.analysis?.caption ?? c.note ?? "";
}

/** Explanation under a photo: the inspector's note leads, then the AI description. */
function photoNote(c: BuildContext["captures"][number]): string {
  const parts = [c.note && c.note !== photoCaption(c) ? c.note : null, c.analysis?.description ?? null].filter(Boolean);
  return parts.join(" ");
}

function photoNode(c: BuildContext["captures"][number]): TiptapNode {
  return photo(c.id, photoCaption(c), photoNote(c));
}

function reportPhotoCaptures(ctx: BuildContext) {
  return ctx.captures.filter((c) => ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport);
}

function scopeText(ctx: BuildContext): string {
  const parts = [
    ctx.project ? `De schouw is uitgevoerd in het kader van project ${ctx.project.number} – ${ctx.project.name}${ctx.project.client ? ` in opdracht van ${ctx.project.client}` : ""} (${ctx.project.contractForm}).` : "Dit betreft een losse schouw die (nog) niet aan een project is gekoppeld.",
    ctx.station ? `Object: MS-station ${ctx.station.code} (${ctx.station.name}).` : null,
    ctx.inspection.address ? `Locatie: ${ctx.inspection.address}.` : null,
    `Weersomstandigheden bij aanvang: ${formatWeather(ctx.inspection.weather)}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** Findings section without AI: each finding with its photos, then the remaining photos. */
function baselineFindings(ctx: BuildContext): TiptapNode[] {
  const photos = reportPhotoCaptures(ctx);
  const used = new Set<string>();
  const out: TiptapNode[] = [];
  const groups = new Map<string, BuildContext["findings"]>();
  const byLocation = ctx.org.settings.export.findingsGrouping === "locatie";
  const sorted = [...ctx.findings].sort((a, b) => {
    const order = { hoog: 0, midden: 1, laag: 2 };
    return order[a.priority] - order[b.priority];
  });
  for (const f of sorted) {
    const key = byLocation ? (f.lat !== null ? "Op locatie" : "Zonder locatie") : FINDING_CATEGORY_LABELS[f.category];
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  if (sorted.length === 0) out.push(paragraph("Tijdens deze schouw zijn geen bevindingen vastgelegd."));
  for (const [group, list] of groups) {
    if (groups.size > 1) out.push(heading(group));
    for (const f of list) {
      out.push(findingRef(f.id));
      const own = f.captureIds.filter((id) => photos.some((p) => p.id === id));
      own.forEach((id) => used.add(id));
      for (const id of own) out.push(photoNode(photos.find((p) => p.id === id)!));
    }
  }
  const rest = photos.filter((p) => !used.has(p.id));
  if (rest.length) {
    out.push(heading("Overige foto's"));
    // Analysed photos get their own figure with explanation; the rest as a compact series.
    const plain: string[] = [];
    const flush = () => {
      for (let i = 0; i < plain.length; i += 4) out.push(photoGrid(plain.slice(i, i + 4), ""));
      plain.length = 0;
    };
    for (const c of rest) {
      if (c.analysis || c.note) {
        flush();
        out.push(photoNode(c));
      } else plain.push(c.id);
    }
    flush();
  }
  return out;
}

function baselineSectionContent(key: string, ctx: BuildContext): TiptapNode[] {
  switch (key) {
    case "samenvatting":
      return [
        paragraph(
          `Op ${ctx.inspection.startedAt.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })} is een ${ctx.template.name.toLowerCase()} uitgevoerd${ctx.inspection.address ? ` bij ${ctx.inspection.address}` : ""}. Er zijn ${ctx.captures.filter((c) => c.type === "photo").length} foto's en ${ctx.findings.length} bevindingen vastgelegd. Vul deze samenvatting aan.`,
        ),
        dataBlock("keyPoints"),
      ];
    case "doel_scope":
      return [...paragraphs(ctx.template.purposeText), paragraph(scopeText(ctx))];
    case "bevindingen":
      return baselineFindings(ctx);
    default:
      return DATA_SECTION_BLOCKS[key] ? [...DATA_SECTION_BLOCKS[key]!] : [paragraph("")];
  }
}

/** Key points derived from findings (no AI). */
export function baselineKeyPoints(ctx: BuildContext): KeyPoint[] {
  return [...ctx.findings]
    .sort((a, b) => ({ hoog: 0, midden: 1, laag: 2 })[a.priority] - ({ hoog: 0, midden: 1, laag: 2 })[b.priority])
    .slice(0, 8)
    .map((f) => ({
      id: `kp-${f.id}`,
      title: f.title,
      description: f.description,
      priority: f.priority,
      category: f.category,
      findingIds: [f.id],
      captureIds: f.captureIds.slice(0, 3),
      source: "handmatig",
      accepted: true,
    }));
}

function newStates(d: TiptapDoc, aiGenerated: boolean, at: string): Record<string, SectionState> {
  const states: Record<string, SectionState> = {};
  for (const s of getSections(d)) {
    const key = String(s.attrs?.key);
    const hash = sectionHash(s);
    states[key] = { key, title: String(s.attrs?.title ?? key), aiHash: aiGenerated ? hash : null, generatedAt: aiGenerated ? at : null, baseHash: aiGenerated ? null : hash };
  }
  return states;
}

/** Report without AI: structured from the recorded data. */
export function buildBaselineReport(ctx: BuildContext, now = new Date()): { content: TiptapDoc; meta: ReportMeta } {
  const d = doc(templateSections(ctx).map((s) => section(s.key, s.title, baselineSectionContent(s.key, ctx))));
  return {
    content: d,
    meta: {
      keyPoints: baselineKeyPoints(ctx),
      openQuestions: [],
      sections: newStates(d, false, now.toISOString()),
      generatedBy: null,
      findingsGrouping: ctx.org.settings.export.findingsGrouping,
    },
  };
}

/** Convert AI blocks to document nodes; unknown capture ids are dropped. */
export function blocksToNodes(blocks: ReportBlock[], findingIdByIndex: (i: number) => string | null, validCaptureIds: Set<string>): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        out.push(...paragraphs(b.text));
        break;
      case "photo":
        if (validCaptureIds.has(b.capture_id)) out.push(photo(b.capture_id, b.caption, b.explanation));
        break;
      case "photo_grid": {
        const ids = b.capture_ids.filter((id) => validCaptureIds.has(id));
        if (ids.length === 1) out.push(photo(ids[0]!, b.caption ?? ""));
        else if (ids.length) out.push(photoGrid(ids, b.caption ?? ""));
        break;
      }
      case "table":
        if (b.columns.length) out.push(...table(b.columns, b.rows, b.caption));
        break;
      case "map":
        out.push(mapSnapshot(b.bbox && b.bbox.length === 4 ? b.bbox : null));
        break;
      case "checklist":
        out.push(dataBlock("checklist"));
        break;
      case "finding_ref": {
        const id = findingIdByIndex(b.finding_index);
        if (id) out.push(findingRef(id));
        break;
      }
    }
  }
  return out;
}

/**
 * Every report photo must appear in the document. Photos the AI did not place
 * go directly after the finding they belong to, into the station section for
 * station components, or otherwise under "Overige foto's" in the findings.
 */
export function placeMissingPhotos(ctx: BuildContext, sections: TiptapNode[], findingCaptures: Map<string, string[]>): TiptapNode[] {
  const placed = new Set(sections.flatMap((s) => referencedCaptureIds(s)));
  const missing = reportPhotoCaptures(ctx).filter((c) => !placed.has(c.id));
  if (missing.length === 0) return sections;
  const byId = new Map(missing.map((c) => [c.id, c]));
  const out = sections.map((s) => ({ ...s, content: [...(s.content ?? [])] }));
  const take = (id: string) => {
    const c = byId.get(id);
    if (c) byId.delete(id);
    return c;
  };

  // 1. After the finding the photo belongs to (behind photos already there).
  for (const s of out) {
    for (let i = 0; i < s.content.length; i++) {
      const n = s.content[i]!;
      if (n.type !== "findingRef") continue;
      const own = (findingCaptures.get(String(n.attrs?.findingId)) ?? []).map(take).filter((c): c is NonNullable<typeof c> => Boolean(c));
      if (own.length === 0) continue;
      let at = i + 1;
      while (at < s.content.length && (s.content[at]!.type === "photo" || s.content[at]!.type === "photoGrid")) at++;
      s.content.splice(at, 0, ...own.map(photoNode));
      i = at + own.length - 1;
    }
  }

  // 2. Station photos into the station section, before its data blocks.
  const station = out.find((s) => s.attrs?.key === "station");
  if (station) {
    const own = [...byId.values()].filter((c) => c.analysis?.station_component).map((c) => take(c.id)!);
    if (own.length) {
      const at = station.content.findIndex((n) => n.type === "dataBlock");
      station.content.splice(at === -1 ? station.content.length : at, 0, ...own.map(photoNode));
    }
  }

  // 3. The rest under "Overige foto's" in the findings (or the first free-text section).
  const rest = [...byId.values()];
  if (rest.length) {
    const target = out.find((s) => s.attrs?.key === "bevindingen") ?? out.find((s) => !DATA_SECTION_BLOCKS[String(s.attrs?.key)] && s.attrs?.key !== "samenvatting") ?? out.at(-1);
    if (target) {
      const at = target.content.findIndex((n) => n.type === "dataBlock");
      target.content.splice(at === -1 ? target.content.length : at, 0, heading("Overige foto's"), ...rest.map(photoNode));
    }
  }
  return out;
}

/** Ensure the fixed data blocks of a section are present exactly once. */
function withDataBlocks(key: string, nodes: TiptapNode[]): TiptapNode[] {
  const required = key === "samenvatting" ? [dataBlock("keyPoints")] : (DATA_SECTION_BLOCKS[key] ?? []);
  const has = (n: TiptapNode) => nodes.some((x) => x.type === n.type && (n.type !== "dataBlock" || x.attrs?.kind === n.attrs?.kind));
  return [...nodes, ...required.filter((r) => !has(r))];
}

/**
 * Build the report document from an AI draft. `findingIds` maps the draft's
 * finding indexes to stored finding ids.
 */
export function buildReportFromDraft(
  ctx: BuildContext,
  draft: ReportDraft,
  findingIds: (string | null)[],
  validCaptureIds: Set<string>,
  opts: { jobId: string | null; model: string; now?: Date },
): { content: TiptapDoc; meta: ReportMeta } {
  const now = opts.now ?? new Date();
  const lookup = (i: number) => findingIds[i] ?? null;
  const byKey = new Map(draft.sections.map((s) => [s.key, s]));
  const sections = templateSections(ctx).map(({ key, title }) => {
    let nodes: TiptapNode[];
    if (key === "samenvatting") {
      // The summary text comes from draft.summary; keep only non-text blocks (photos, tables) from the section.
      const extra = blocksToNodes(byKey.get(key)?.blocks ?? [], lookup, validCaptureIds).filter((n) => n.type !== "paragraph");
      nodes = [...paragraphs(draft.summary), ...extra];
    } else if (key === "doel_scope" && !byKey.get(key)?.blocks.length) {
      nodes = baselineSectionContent(key, ctx);
    } else {
      const aiNodes = blocksToNodes(byKey.get(key)?.blocks ?? [], lookup, validCaptureIds);
      nodes = aiNodes.length ? aiNodes : baselineSectionContent(key, ctx);
    }
    return section(key, byKey.get(key)?.title ?? title, withDataBlocks(key, nodes));
  });
  const findingCaptures = new Map<string, string[]>(ctx.findings.map((f) => [f.id, f.captureIds]));
  draft.findings.forEach((f, i) => {
    const id = findingIds[i];
    if (id) findingCaptures.set(id, [...new Set([...(findingCaptures.get(id) ?? []), ...f.capture_ids])]);
  });
  const d = doc(placeMissingPhotos(ctx, sections, findingCaptures));
  const resolveFindingRefs = (ids: string[]) =>
    ids.map((x) => (/^\d+$/.test(x) ? lookup(Number(x)) : ctx.findings.some((f) => f.id === x) ? x : null)).filter((x): x is string => Boolean(x));
  const keyPoints: KeyPoint[] = draft.key_points.map((kp, i) => ({
    id: `kp-ai-${i}-${now.getTime()}`,
    title: kp.title,
    description: kp.description,
    priority: kp.priority,
    category: kp.category,
    findingIds: resolveFindingRefs(kp.finding_ids),
    captureIds: kp.capture_ids.filter((id) => validCaptureIds.has(id)),
    source: "ai",
    accepted: false,
  }));
  const openQuestions: OpenQuestion[] = draft.open_questions.map((q, i) => ({ id: `q-${now.getTime()}-${i}`, question: q, answer: null, resolved: false }));
  return {
    content: d,
    meta: {
      keyPoints,
      openQuestions,
      sections: newStates(d, true, now.toISOString()),
      generatedBy: { jobId: opts.jobId, model: opts.model, at: now.toISOString() },
      station: draft.station,
      findingsGrouping: ctx.org.settings.export.findingsGrouping,
    },
  };
}

/** True when a section differs from what the AI last generated (i.e. edited by hand). */
export function isSectionEdited(node: TiptapNode, state: SectionState | undefined): boolean {
  if (!state) return true;
  const hash = sectionHash(node);
  if (state.aiHash !== null && hash === state.aiHash) return false;
  // An untouched baseline section (no AI yet) may be replaced by the AI proposal.
  if (state.baseHash && hash === state.baseHash) return false;
  return true;
}

/**
 * Merge a newly generated document into the existing one: sections edited by
 * hand are kept unless `force` is set; new sections are appended in order.
 */
export function mergeGenerated(
  existing: { content: TiptapDoc; meta: ReportMeta } | null,
  generated: { content: TiptapDoc; meta: ReportMeta },
  opts: { force?: boolean; onlyKeys?: string[] } = {},
): { content: TiptapDoc; meta: ReportMeta; kept: string[] } {
  if (!existing) return { ...generated, kept: [] };
  const kept: string[] = [];
  const oldByKey = new Map(getSections(existing.content).map((s) => [String(s.attrs?.key), s]));
  const sections: TiptapNode[] = [];
  const states: Record<string, SectionState> = {};
  for (const gen of getSections(generated.content)) {
    const key = String(gen.attrs?.key);
    const old = oldByKey.get(key);
    const replaceAllowed = !opts.onlyKeys || opts.onlyKeys.includes(key);
    if (old && (!replaceAllowed || (!opts.force && isSectionEdited(old, existing.meta.sections[key])))) {
      sections.push(old);
      states[key] = existing.meta.sections[key] ?? { key, title: String(old.attrs?.title), aiHash: null, generatedAt: null };
      if (replaceAllowed) kept.push(key);
    } else {
      sections.push(gen);
      states[key] = generated.meta.sections[key]!;
    }
    oldByKey.delete(key);
  }
  // Sections only present in the old document (e.g. added by hand) are kept.
  for (const [key, old] of oldByKey) {
    sections.push(old);
    states[key] = existing.meta.sections[key] ?? { key, title: String(old.attrs?.title), aiHash: null, generatedAt: null };
  }
  const acceptedKeyPoints = existing.meta.keyPoints.filter((k) => k.source === "handmatig" || k.accepted);
  const keepKeyPoints = !opts.force && kept.includes("samenvatting");
  return {
    content: doc(sections),
    meta: {
      ...generated.meta,
      keyPoints: keepKeyPoints ? existing.meta.keyPoints : [...acceptedKeyPoints, ...generated.meta.keyPoints.filter((k) => !acceptedKeyPoints.some((a) => a.title === k.title))],
      openQuestions: [...existing.meta.openQuestions.filter((q) => q.resolved), ...generated.meta.openQuestions],
      sections: states,
    },
    kept,
  };
}

export function priorityLabel(p: "hoog" | "midden" | "laag") {
  return PRIORITY_LABELS[p];
}

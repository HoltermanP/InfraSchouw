"use client";

import Link from "next/link";
import { Node, mergeAttributes, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { GripVertical, MapPin, Sparkles, Trash2, Map as MapIcon, Table2 } from "lucide-react";
import { PRIORITY_COLORS, PRIORITY_LABELS, FINDING_CATEGORY_LABELS } from "@/lib/domain";
import { DATA_BLOCK_LABELS, sectionHash, type DataBlockKind } from "@/lib/report/doc";
import type { TiptapNode } from "@/lib/report/types";
import { cn } from "@/lib/utils";
import { useReportEditor } from "./context";

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function SectionView({ node, updateAttributes }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const key = String(node.attrs.key);
  const title = String(node.attrs.title ?? "");
  const state = ctx.meta.sections[key];
  const json = node.toJSON() as TiptapNode;
  const edited = !state?.aiHash || sectionHash(json) !== state.aiHash;
  const aiUntouched = Boolean(state?.aiHash) && !edited && !ctx.finalised;
  return (
    <NodeViewWrapper as="section" className="report-section my-6 rounded-lg border bg-card p-4" data-section-key={key} id={`section-${key}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b pb-2" contentEditable={false}>
        <input
          className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none focus:ring-2 focus:ring-ring/40"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          readOnly={ctx.readOnly}
          aria-label={`Titel sectie ${key}`}
        />
        {aiUntouched ? (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">AI-voorstel</span>
        ) : state?.aiHash && !ctx.finalised ? (
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Handmatig bewerkt</span>
        ) : null}
        {!ctx.readOnly && ctx.canRegenerate ? (
          <button
            type="button"
            onClick={() => ctx.onRegenerate(key, title, edited && Boolean(state?.aiHash))}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
            data-testid={`regenerate-${key}`}
          >
            <Sparkles className="size-3.5" /> Opnieuw genereren met AI
          </button>
        ) : null}
      </div>
      <NodeViewContent className="report-prose" />
    </NodeViewWrapper>
  );
}

export const ReportSection = Node.create({
  name: "reportSection",
  group: "section",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { key: { default: "sectie" }, title: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "section[data-section-key]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-section-key": HTMLAttributes.key }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SectionView);
  },
});

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------
function PhotoView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const id = String(node.attrs.captureId);
  const c = ctx.captures.get(id);
  return (
    <NodeViewWrapper as="figure" className={cn("group relative my-3 max-w-xl rounded-md border p-2", selected && "ring-2 ring-primary")} id={`capture-${id}`} data-testid="report-photo">
      <div className="flex items-start gap-2" contentEditable={false}>
        {!ctx.readOnly ? (
          <span data-drag-handle className="mt-1 cursor-grab text-muted-foreground" title="Sleep om te verplaatsen">
            <GripVertical className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {c?.thumb ? <img src={c.type === "video" ? c.thumb : (c.url ?? c.thumb)} alt={c.analysis?.caption ?? ""} className="max-h-80 rounded object-contain" loading="lazy" /> : <p className="text-sm text-destructive">Foto niet gevonden</p>}
          <figcaption className="mt-1 flex items-center gap-2 text-sm">
            <span className="shrink-0 font-semibold">Foto {c?.seq ?? "–"}</span>
            <input
              className="min-w-0 flex-1 border-b border-transparent bg-transparent outline-none focus:border-border"
              value={String(node.attrs.caption ?? "")}
              placeholder={c?.analysis?.caption ?? "Bijschrift"}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
              readOnly={ctx.readOnly}
              aria-label="Bijschrift"
            />
          </figcaption>
          <p className="text-xs text-muted-foreground">
            {c ? new Date(c.capturedAt).toLocaleString("nl-NL") : ""}
            {c?.rdX ? ` · RD ${Math.round(c.rdX)}, ${Math.round(c.rdY!)}` : ""}
            {c?.lat !== null && c ? (
              <>
                {" · "}
                <Link href={`/schouwen/${ctx.inspectionId}?capture=${id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline" data-testid="photo-to-map">
                  <MapPin className="size-3" /> op kaart
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {!ctx.readOnly ? (
          <button type="button" onClick={deleteNode} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Verwijder foto uit verslag" title="Verwijderen uit verslag (blijft in de schouw)">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

export const Photo = Node.create({
  name: "photo",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { captureId: { default: null }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-capture-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-capture-id": HTMLAttributes.captureId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PhotoView);
  },
});

// ---------------------------------------------------------------------------
// Photo grid
// ---------------------------------------------------------------------------
function PhotoGridView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const ids = (node.attrs.captureIds as string[]) ?? [];
  return (
    <NodeViewWrapper className={cn("group my-3 rounded-md border p-2", selected && "ring-2 ring-primary")} data-testid="report-photo-grid">
      <div contentEditable={false}>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {!ctx.readOnly ? (
              <span data-drag-handle className="cursor-grab">
                <GripVertical className="size-4" />
              </span>
            ) : null}
            Fotoreeks ({ids.length})
          </span>
          {!ctx.readOnly ? (
            <button type="button" onClick={deleteNode} className="rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Verwijder fotoreeks uit verslag">
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {ids.map((id) => {
            const c = ctx.captures.get(id);
            return (
              <div key={id} id={`capture-${id}`} className="relative">
                {c?.thumb ? <img src={c.thumb} alt="" className="aspect-square w-full rounded object-cover" loading="lazy" /> : <div className="aspect-square rounded bg-muted" />}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">Foto {c?.seq ?? "–"}</span>
                {!ctx.readOnly ? (
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded bg-white/90 p-0.5"
                    aria-label="Haal foto uit reeks"
                    onClick={() => {
                      const next = ids.filter((x) => x !== id);
                      if (next.length) updateAttributes({ captureIds: next });
                      else deleteNode();
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <input
          className="mt-1 w-full bg-transparent text-sm outline-none"
          value={String(node.attrs.caption ?? "")}
          placeholder="Bijschrift fotoreeks (optioneel)"
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          readOnly={ctx.readOnly}
          aria-label="Bijschrift fotoreeks"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const PhotoGrid = Node.create({
  name: "photoGrid",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { captureIds: { default: [] }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-photo-grid]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-photo-grid": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PhotoGridView);
  },
});

// ---------------------------------------------------------------------------
// Map snapshot
// ---------------------------------------------------------------------------
function MapSnapshotView({ selected, deleteNode }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const src = ctx.mapSnapshotUrl ?? `/api/reports/${ctx.reportId}/static-map`;
  return (
    <NodeViewWrapper className={cn("group my-3 rounded-md border p-2", selected && "ring-2 ring-primary")} data-testid="report-map">
      <div contentEditable={false}>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapIcon className="size-3.5" /> Overzichtskaart {ctx.mapSnapshotUrl ? "(vastgelegd kaartbeeld)" : "(automatisch uit PDOK)"}
          </span>
          <span className="flex gap-2">
            <Link href={`/schouwen/${ctx.inspectionId}`} className="text-primary hover:underline">
              Kaartbeeld aanpassen
            </Link>
            {!ctx.readOnly ? (
              <button type="button" onClick={deleteNode} className="opacity-0 group-hover:opacity-100" aria-label="Verwijder kaart">
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </span>
        </div>
        <img src={src} alt="Overzichtskaart met fotolocaties, bevindingen en track" className="w-full rounded" loading="lazy" />
      </div>
    </NodeViewWrapper>
  );
}

export const MapSnapshot = Node.create({
  name: "mapSnapshot",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { bbox: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-map-snapshot]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-map-snapshot": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MapSnapshotView);
  },
});

// ---------------------------------------------------------------------------
// Finding reference
// ---------------------------------------------------------------------------
function FindingRefView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const f = ctx.findings.get(String(node.attrs.findingId));
  return (
    <NodeViewWrapper className={cn("group my-2 flex overflow-hidden rounded-md border", selected && "ring-2 ring-primary")} id={f ? `finding-${f.id}` : undefined} data-testid="report-finding">
      <div contentEditable={false} className="flex w-full">
        <div className="w-1.5 shrink-0" style={{ background: f ? PRIORITY_COLORS[f.priority] : "#999" }} />
        <div className="flex-1 p-3 text-sm">
          {f ? (
            <>
              <p className="font-semibold">
                B{f.nr}. {f.title} {!f.aiAccepted ? <span className="ml-1 rounded bg-violet-100 px-1.5 text-xs font-medium text-violet-800">AI-voorstel</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Prioriteit {PRIORITY_LABELS[f.priority]} · {FINDING_CATEGORY_LABELS[f.category]}
                {f.captureIds.length ? ` · foto ${f.captureIds.map((id) => ctx.captures.get(id)?.seq).filter(Boolean).join(", ")}` : ""}
              </p>
              <p className="mt-1">{f.description}</p>
              {f.recommendation ? <p className="mt-1 text-muted-foreground">Aanbeveling: {f.recommendation}</p> : null}
              <Link href={`/schouwen/${ctx.inspectionId}/bevindingen#finding-${f.id}`} className="text-xs text-primary hover:underline">
                Bewerk bevinding
              </Link>
            </>
          ) : (
            <p className="text-destructive">Bevinding bestaat niet meer.</p>
          )}
        </div>
        {!ctx.readOnly ? (
          <button type="button" onClick={deleteNode} className="p-2 opacity-0 group-hover:opacity-100" aria-label="Verwijder bevinding uit verslag">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

export const FindingRef = Node.create({
  name: "findingRef",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { findingId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-finding-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-finding-id": HTMLAttributes.findingId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FindingRefView);
  },
});

// ---------------------------------------------------------------------------
// Live data blocks (filled from the current data at export time)
// ---------------------------------------------------------------------------
function DataBlockView({ node, selected }: ReactNodeViewProps) {
  const ctx = useReportEditor();
  const kind = node.attrs.kind as DataBlockKind;
  const s = ctx.summary;
  let detail: React.ReactNode = null;
  switch (kind) {
    case "keyPoints":
      detail =
        ctx.meta.keyPoints.length === 0 ? (
          <p className="text-muted-foreground">Nog geen aandachtspunten — voeg ze toe in het paneel ‘Aandachtspunten’.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {ctx.meta.keyPoints.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="w-20 py-1">
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: PRIORITY_COLORS[k.priority] }}>
                      {PRIORITY_LABELS[k.priority]}
                    </span>
                  </td>
                  <td className="w-28 text-xs text-muted-foreground">{FINDING_CATEGORY_LABELS[k.category]}</td>
                  <td>
                    {k.title}
                    {k.source === "ai" && !k.accepted ? <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">AI</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      break;
    case "actions":
      detail = <p>{s.actions} actiepunt(en) — tabel wie/wat/wanneer.</p>;
      break;
    case "checklist":
      detail = (
        <p>
          {s.checklist.answered} van {s.checklist.total} vragen beantwoord.
        </p>
      );
      break;
    case "photoRegister":
      detail = <p>{s.photos} foto&apos;s met nummer, tijd, RD- en WGS84-coördinaten, richting en bijschrift.</p>;
      break;
    case "measurements":
      detail = <p>{s.measurements} meting(en).</p>;
      break;
    case "transcript":
      detail = <p>{s.segments} transcriptsegment(en) (in de PDF als bijlage).</p>;
      break;
    case "participants":
      detail = <p>{s.participants} deelnemer(s) met handtekeningen.</p>;
      break;
    case "station":
      detail = s.station ? <p>Installatiebeschrijving station {s.station.code} {s.station.described ? "" : "(nog niet ingevuld)"}.</p> : <p>Geen station gekoppeld.</p>;
      break;
    case "asbuilt":
      detail = s.asbuilt ? (
        <p>
          As-built-check: {s.asbuilt.conform} conform, {s.asbuilt.afwijkend} afwijkend, {s.asbuilt.nietVastgesteld} niet vastgesteld.
        </p>
      ) : (
        <p>As-built-check nog niet uitgevoerd.</p>
      );
      break;
    case "billing":
      detail = <p>{s.billing} afrekenregel(s) met bewijsfoto&apos;s.</p>;
      break;
    case "findings":
      detail = <p>{ctx.findings.size} bevinding(en).</p>;
      break;
  }
  return (
    <NodeViewWrapper className={cn("my-3 rounded-md border border-dashed bg-muted/30 p-3", selected && "ring-2 ring-primary")} data-testid={`data-block-${kind}`}>
      <div contentEditable={false}>
        <p className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Table2 className="size-3.5" /> {DATA_BLOCK_LABELS[kind] ?? kind} · automatisch uit de schouwgegevens
        </p>
        <div className="text-sm">{detail}</div>
      </div>
    </NodeViewWrapper>
  );
}

export const DataBlock = Node.create({
  name: "dataBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { kind: { default: "keyPoints" } };
  },
  parseHTML() {
    return [{ tag: "div[data-block-kind]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-block-kind": HTMLAttributes.kind })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DataBlockView);
  },
});

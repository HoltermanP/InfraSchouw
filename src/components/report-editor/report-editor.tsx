"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading3,
  Quote,
  Table2,
  Undo2,
  Redo2,
  Save,
  FileText,
  History,
  Images,
  ListChecks,
  RefreshCw,
  Lock,
  Sparkles,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ReportStatusBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { changeReportStatus, regenerateSection, saveReportContent } from "@/app/(app)/schouwen/[id]/verslag/actions";
import { REPORT_TRANSITIONS, roleAtLeast, type ReportStatus, type Role } from "@/lib/domain";
import { dataBlock, DATA_BLOCK_KINDS, DATA_BLOCK_LABELS, referencedCaptureIds, section, paragraph, type DataBlockKind } from "@/lib/report/doc";
import type { ReportMeta, TiptapDoc } from "@/lib/report/types";
import type { CaptureDto } from "@/lib/report/dto";
import { cn } from "@/lib/utils";
import { ReportEditorContext, type DataSummary, type EditorFinding } from "./context";
import { DataBlock, FindingRef, MapSnapshot, Photo, PhotoGrid, ReportSection } from "./nodes";
import { CAPTURE_DRAG_TYPE, KeyPointsEditor, OpenQuestionsPanel, PhotoPanel } from "./side-panels";
import { VersionsPanel, type VersionRow } from "./versions-panel";
import { ShareLinksPanel, type ShareLinkRow } from "./share-links";

const ReportDocument = Document.extend({ content: "section+" });

type Panel = "fotos" | "aandachtspunten" | "versies" | "voorbeeld" | "delen";

function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded p-1.5 hover:bg-muted disabled:opacity-40", active && "bg-muted text-primary")}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Opmaak">
      {btn("Vet", <Bold className="size-4" />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("Cursief", <Italic className="size-4" />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("Tussenkop", <Heading3 className="size-4" />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading"))}
      {btn("Opsomming", <List className="size-4" />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("Genummerde lijst", <ListOrdered className="size-4" />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("Citaat", <Quote className="size-4" />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("Tabel invoegen", <Table2 className="size-4" />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {editor.isActive("table") ? (
        <>
          {btn("Rij toevoegen", <span className="px-1 text-xs">+rij</span>, () => editor.chain().focus().addRowAfter().run())}
          {btn("Kolom toevoegen", <span className="px-1 text-xs">+kol</span>, () => editor.chain().focus().addColumnAfter().run())}
          {btn("Tabel verwijderen", <span className="px-1 text-xs">×tabel</span>, () => editor.chain().focus().deleteTable().run())}
        </>
      ) : null}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("Ongedaan maken", <Undo2 className="size-4" />, () => editor.chain().focus().undo().run())}
      {btn("Opnieuw", <Redo2 className="size-4" />, () => editor.chain().focus().redo().run())}
    </div>
  );
}

export function ReportEditor(props: {
  inspectionId: string;
  reportId: string;
  versionId: string | null;
  versionNumber: number | null;
  status: ReportStatus;
  role: Role;
  content: TiptapDoc;
  meta: ReportMeta;
  captures: CaptureDto[];
  findings: EditorFinding[];
  summary: DataSummary;
  mapSnapshotUrl: string | null;
  versions: VersionRow[];
  shareLinks: ShareLinkRow[];
  aiEnabled: boolean;
  initialPanel?: Panel;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [meta, setMeta] = useState<ReportMeta>(props.meta);
  const [dirty, setDirty] = useState(false);
  // Saving creates a new version, which remounts the editor (keyed by version);
  // remember the open side panel per report so it survives that remount.
  const panelKey = `infraschouw:report-panel:${props.reportId}`;
  const [panel, setPanelState] = useState<Panel>(() => props.initialPanel ?? readStoredPanel(panelKey) ?? "fotos");
  const setPanel = useCallback(
    (p: Panel) => {
      setPanelState(p);
      try {
        sessionStorage.setItem(panelKey, p);
      } catch {
        // Storage unavailable (private mode): the panel simply resets on save.
      }
    },
    [panelKey],
  );
  useEffect(() => {
    editorHydrated = true;
  }, []);
  const [regen, setRegen] = useState<{ key: string; title: string; edited: boolean } | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenForce, setRegenForce] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [insertKind, setInsertKind] = useState<DataBlockKind>("keyPoints");
  const locked = props.status === "definitief";
  const readOnly = locked || !roleAtLeast(props.role, "schouwer") || (props.status === "ter_review" && !roleAtLeast(props.role, "projectleider"));
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set(referencedCaptureIds(props.content)));

  const captureMap = useMemo(() => new Map(props.captures.map((c) => [c.id, c])), [props.captures]);
  const findingMap = useMemo(() => new Map(props.findings.map((f) => [f.id, f])), [props.findings]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      ReportDocument,
      StarterKit.configure({ document: false, heading: { levels: [2, 3] }, link: false }),
      Placeholder.configure({ placeholder: "Typ hier de tekst van deze sectie…" }),
      TableKit.configure({ table: { resizable: false } }),
      ReportSection,
      Photo,
      PhotoGrid,
      MapSnapshot,
      FindingRef,
      DataBlock,
    ],
    content: props.content,
    editorProps: {
      attributes: { class: "report-prose min-h-96 focus:outline-none", "aria-label": "Verslaginhoud", "data-testid": "report-editor" },
      handleDrop(view, event) {
        const id = event.dataTransfer?.getData(CAPTURE_DRAG_TYPE);
        if (!id) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coords) return true;
        const c = captureMap.get(id);
        const node = view.state.schema.nodes.photo!.create({ captureId: id, caption: c?.analysis?.caption ?? c?.note ?? "" });
        // Insert after the block under the cursor.
        const $pos = view.state.doc.resolve(coords.pos);
        let depth = $pos.depth;
        while (depth > 1 && !$pos.node(depth).isBlock) depth--;
        const insertAt = depth >= 2 ? $pos.after(depth) : coords.pos;
        view.dispatch(view.state.tr.insert(Math.min(insertAt, view.state.doc.content.size), node));
        return true;
      },
    },
    onUpdate({ editor: ed }) {
      setDirty(true);
      setUsedIds(new Set(referencedCaptureIds(ed.getJSON() as TiptapDoc)));
    },
  });

  const updateMeta = useCallback((patch: Partial<ReportMeta>) => {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(
    async (note?: string) => {
      if (!editor || readOnly) return false;
      const res = await run(() => saveReportContent(props.reportId, { content: editor.getJSON(), meta, note: note ?? null, baseVersionId: props.versionId }), { refresh: true });
      if (res.ok) setDirty(false);
      return res.ok;
    },
    [editor, meta, props.reportId, props.versionId, readOnly, run],
  );

  // Ctrl/Cmd+S and unload warning.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, save]);

  // Jump to #capture-… / #finding-… anchors (e.g. "toon in verslag" from the map).
  useEffect(() => {
    if (!editor) return;
    const hash = window.location.hash;
    if (!hash) return;
    const t = setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-4", "ring-amber-400");
        setTimeout(() => el.classList.remove("ring-4", "ring-amber-400"), 2500);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [editor]);

  // Poll for a new version while a section is being regenerated.
  useEffect(() => {
    if (!waitingFor) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/reports/${props.reportId}/state`, { cache: "no-store" });
      if (!res.ok) return;
      const state = (await res.json()) as { currentVersionId: string | null; pendingJobs: number; lastJob: { status: string; error: string | null } | null };
      if (state.currentVersionId && state.currentVersionId !== props.versionId) {
        setWaitingFor(null);
        toast.success("Nieuwe AI-versie van de sectie is klaar");
        router.refresh();
      } else if (state.pendingJobs === 0 && state.lastJob && state.lastJob.status !== "succeeded") {
        setWaitingFor(null);
        toast.error(state.lastJob.error ?? "Opnieuw genereren is niet gelukt");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waitingFor, props.reportId, props.versionId, router]);

  async function refreshPreview() {
    if (!editor) return;
    setPreviewBusy(true);
    try {
      const res = await fetch(`/api/reports/${props.reportId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editor.getJSON(), meta }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch {
      toast.error("PDF-voorbeeld maken mislukt");
    } finally {
      setPreviewBusy(false);
    }
  }
  // Live preview: re-render after 3 s without edits while the preview is open.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (panel !== "voorbeeld") return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => void refreshPreview(), previewUrl ? 3000 : 50);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, dirty, meta, editor?.state.doc]);

  const transitions = REPORT_TRANSITIONS[props.status].filter((t) => roleAtLeast(props.role, t.minRole));

  const ctxValue = useMemo(
    () => ({
      inspectionId: props.inspectionId,
      reportId: props.reportId,
      captures: captureMap,
      findings: findingMap,
      meta,
      mapSnapshotUrl: props.mapSnapshotUrl,
      readOnly,
      finalised: locked,
      summary: props.summary,
      canRegenerate: props.aiEnabled,
      onRegenerate: (key: string, title: string, edited: boolean) => {
        setRegen({ key, title, edited });
        setRegenForce(false);
        setRegenInstruction("");
      },
    }),
    [props.inspectionId, props.reportId, captureMap, findingMap, meta, props.mapSnapshotUrl, readOnly, locked, props.summary, props.aiEnabled],
  );

  return (
    <ReportEditorContext.Provider value={ctxValue}>
      <div className="flex flex-col gap-4 px-4 py-4 md:px-8">
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
          <ReportStatusBadge status={props.status} />
          <span className="text-sm text-muted-foreground">Versie {props.versionNumber ?? "–"}</span>
          {dirty ? <span className="text-xs font-medium text-amber-600">Niet opgeslagen wijzigingen</span> : null}
          {locked ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Definitief en vergrendeld
            </span>
          ) : null}
          {waitingFor ? (
            <span className="flex items-center gap-1 text-xs text-violet-700">
              <RefreshCw className="size-3.5 animate-spin" /> AI genereert “{waitingFor}”…
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {!readOnly ? (
              <Button onClick={() => save()} disabled={pending || !dirty} data-testid="save-report">
                <Save /> Opslaan
              </Button>
            ) : null}
            {transitions.map((t) => (
              <Button
                key={t.to}
                variant={t.to === "definitief" ? "default" : "outline"}
                disabled={pending}
                data-testid={`transition-${t.to}`}
                onClick={async () => {
                  if (dirty && !(await save("Opgeslagen vóór statuswijziging"))) return;
                  if (t.to === "definitief" && !confirm("Verslag definitief maken? Het wordt vergrendeld en de PDF wordt gearchiveerd met een hash.")) return;
                  await run(() => changeReportStatus(props.reportId, t.to));
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <OpenQuestionsPanel questions={meta.openQuestions} onChange={(openQuestions) => updateMeta({ openQuestions })} readOnly={readOnly} />

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="min-w-0 flex-1">
            {!readOnly ? (
              <div className="sticky top-16 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-background p-1">
                <Toolbar editor={editor} disabled={readOnly} />
                <span className="mx-1 h-5 w-px bg-border" />
                <NativeSelect value={insertKind} onChange={(e) => setInsertKind(e.target.value as DataBlockKind)} className="h-7 w-52 text-xs" aria-label="Datablok">
                  {DATA_BLOCK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DATA_BLOCK_LABELS[k]}
                    </option>
                  ))}
                </NativeSelect>
                <Button size="xs" variant="outline" onClick={() => editor?.chain().focus().insertContent(dataBlock(insertKind)).run()}>
                  <Plus /> Datablok
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const title = prompt("Titel van de nieuwe sectie");
                    if (!title || !editor) return;
                    const key = `extra_${Date.now().toString(36)}`;
                    editor.chain().insertContentAt(editor.state.doc.content.size, section(key, title, [paragraph("")])).run();
                  }}
                >
                  <Plus /> Sectie
                </Button>
              </div>
            ) : null}
            <EditorContent editor={editor} />
          </div>

          <aside className="w-full shrink-0 xl:w-96" aria-label="Zijpaneel">
            <div className="sticky top-16 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1 rounded-md border p-1" role="tablist">
                {(
                  [
                    ["fotos", "Foto's", Images],
                    ["aandachtspunten", "Aandachtspunten", ListChecks],
                    ["versies", "Versies", History],
                    ["voorbeeld", "PDF-voorbeeld", FileText],
                    ...(props.status === "definitief" || props.status === "herzien" ? [["delen", "Delen", Sparkles] as const] : []),
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={panel === key}
                    onClick={() => setPanel(key)}
                    className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium", panel === key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                    data-testid={`panel-${key}`}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[calc(100dvh_-_12rem)] overflow-y-auto rounded-md border p-3">
                {panel === "fotos" ? <PhotoPanel captures={props.captures} usedIds={usedIds} /> : null}
                {panel === "aandachtspunten" ? (
                  <KeyPointsEditor points={meta.keyPoints} onChange={(keyPoints) => updateMeta({ keyPoints })} readOnly={readOnly} findings={props.findings.map((f) => ({ id: f.id, title: f.title, nr: f.nr }))} />
                ) : null}
                {panel === "versies" ? <VersionsPanel reportId={props.reportId} versions={props.versions} currentVersionId={props.versionId} readOnly={readOnly} dirty={dirty} /> : null}
                {panel === "voorbeeld" ? (
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={refreshPreview} disabled={previewBusy}>
                      <RefreshCw className={cn(previewBusy && "animate-spin")} /> Voorbeeld vernieuwen
                    </Button>
                    <p className="text-xs text-muted-foreground">Het voorbeeld toont de huidige (ook niet-opgeslagen) inhoud en ververst automatisch.</p>
                    {previewUrl ? <iframe src={previewUrl} title="PDF-voorbeeld" className="h-[70vh] w-full rounded border" data-testid="pdf-preview" /> : <p className="text-sm text-muted-foreground">Voorbeeld wordt gemaakt…</p>}
                  </div>
                ) : null}
                {panel === "delen" ? <ShareLinksPanel reportId={props.reportId} links={props.shareLinks} canManage={roleAtLeast(props.role, "projectleider")} /> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={Boolean(regen)} onOpenChange={(o) => !o && setRegen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sectie “{regen?.title}” opnieuw genereren</DialogTitle>
            <DialogDescription>De AI schrijft de sectie opnieuw op basis van alle bronnen. Er wordt een nieuwe versie gemaakt; eerdere versies blijven terug te zetten.</DialogDescription>
          </DialogHeader>
          <Input value={regenInstruction} onChange={(e) => setRegenInstruction(e.target.value)} placeholder="Extra instructie (optioneel), bijv. ‘korter en per tracédeel’" aria-label="Extra instructie" />
          {regen?.edited ? (
            <label className="flex items-start gap-2 rounded bg-amber-50 p-2 text-sm dark:bg-amber-950/30">
              <Checkbox checked={regenForce} onCheckedChange={(v) => setRegenForce(Boolean(v))} />
              Deze sectie is handmatig bewerkt. Toch overschrijven met een nieuwe AI-versie.
            </label>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending || (regen?.edited && !regenForce) || dirty}
              onClick={async () => {
                if (!regen) return;
                const res = await run(() => regenerateSection(props.reportId, regen.key, regenInstruction || null, regenForce), { refresh: false });
                if (res.ok) {
                  setWaitingFor(regen.title);
                  setRegen(null);
                }
              }}
            >
              <Sparkles /> Genereer opnieuw
            </Button>
          </DialogFooter>
          {dirty ? <p className="text-xs text-amber-700">Sla eerst je wijzigingen op.</p> : null}
        </DialogContent>
      </Dialog>
    </ReportEditorContext.Provider>
  );
}

/** True after the first editor mount; before that, reading storage would cause a hydration mismatch. */
let editorHydrated = false;

function readStoredPanel(key: string): Panel | null {
  if (typeof window === "undefined" || !editorHydrated) return null;
  try {
    return (sessionStorage.getItem(key) as Panel | null) ?? null;
  } catch {
    return null;
  }
}

"use client";

import { useMemo, useState } from "react";
import { EyeOff, Eye, PenLine, Tag, Link2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AnnotationEditor } from "@/components/annotation/annotation-editor";
import { useAction } from "@/hooks/use-action";
import { deleteCaptureAction, saveAnnotation, updateCaptures } from "@/app/(app)/schouwen/actions";
import { CAPTURE_TYPES, CAPTURE_TYPE_LABELS, type CaptureType } from "@/lib/domain";
import type { CaptureDto } from "@/lib/report/dto";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CaptureInfo, CaptureMedia } from "./inspection-map-view";

export function MediaGrid({
  inspectionId,
  captures,
  shots,
  findings,
  canEdit,
}: {
  inspectionId: string;
  captures: CaptureDto[];
  shots: { id: string; label: string }[];
  findings: { id: string; title: string }[];
  canEdit: boolean;
}) {
  const [type, setType] = useState<CaptureType | "">("");
  const [tag, setTag] = useState("");
  const [shot, setShot] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [findingId, setFindingId] = useState(findings[0]?.id ?? "");
  const { run, pending } = useAction();

  const allTags = useMemo(() => [...new Set(captures.flatMap((c) => [...c.tags, ...(c.analysis?.tags ?? [])]))].sort(), [captures]);
  const visible = captures.filter(
    (c) =>
      (!type || c.type === type) &&
      (!tag || c.tags.includes(tag) || c.analysis?.tags.includes(tag)) &&
      (!shot || c.shotId === shot),
  );
  const current = open ? captures.find((c) => c.id === open) : null;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={type} onChange={(e) => setType(e.target.value as CaptureType | "")} className="w-40" aria-label="Type">
          <option value="">Alle typen</option>
          {CAPTURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CAPTURE_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={tag} onChange={(e) => setTag(e.target.value)} className="w-40" aria-label="Tag">
          <option value="">Alle tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
        {shots.length ? (
          <NativeSelect value={shot} onChange={(e) => setShot(e.target.value)} className="w-64" aria-label="Shotlist">
            <option value="">Alle shots</option>
            {shots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <span className="text-sm text-muted-foreground">{visible.length} items</span>
        {canEdit ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Checkbox checked={selected.length > 0 && selected.length === visible.length} onCheckedChange={(v) => setSelected(v ? visible.map((c) => c.id) : [])} />
            Alles selecteren
          </label>
        ) : null}
      </div>

      {canEdit && selected.length ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow" data-testid="bulk-actions">
          <span className="text-sm font-medium">{selected.length} geselecteerd</span>
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="tag" className="w-32" aria-label="Nieuwe tag" />
          <Button size="sm" variant="outline" disabled={pending || !newTag.trim()} onClick={() => run(() => updateCaptures(selected, { addTags: [newTag] }), { onSuccess: () => setNewTag("") })}>
            <Tag /> Tag toevoegen
          </Button>
          {findings.length ? (
            <>
              <NativeSelect value={findingId} onChange={(e) => setFindingId(e.target.value)} className="w-56" aria-label="Bevinding">
                {findings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </NativeSelect>
              <Button size="sm" variant="outline" disabled={pending || !findingId} onClick={() => run(() => updateCaptures(selected, { findingId }))}>
                <Link2 /> Koppel aan bevinding
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateCaptures(selected, { hiddenInReport: true }))}>
            <EyeOff /> Verberg uit verslag
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateCaptures(selected, { hiddenInReport: false }))}>
            <Eye /> Toon in verslag
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            <X /> Wissen
          </Button>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" data-testid="media-grid">
        {visible.map((c) => (
          <li key={c.id} className={cn("group relative overflow-hidden rounded-lg border", selected.includes(c.id) && "ring-2 ring-primary", c.hiddenInReport && "opacity-60")}>
            <button type="button" onClick={() => setOpen(c.id)} className="block w-full text-left">
              <div className="aspect-square overflow-hidden bg-muted">
                {c.thumb && c.type !== "audio" ? (
                  <img src={c.thumb} alt={c.analysis?.caption ?? ""} loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.textContent ?? CAPTURE_TYPE_LABELS[c.type]}</div>
                )}
              </div>
              <div className="p-2 text-xs">
                <p className="font-medium">
                  {CAPTURE_TYPE_LABELS[c.type]} {c.seq ?? ""} · {fmtTime(c.capturedAt)}
                </p>
                <p className="line-clamp-2 text-muted-foreground">{c.analysis?.caption ?? c.note ?? c.shot ?? ""}</p>
                {c.hiddenInReport ? <p className="text-amber-700">Verborgen in verslag</p> : null}
              </div>
            </button>
            {canEdit ? (
              <span className="absolute top-2 left-2 rounded bg-white/90 p-0.5">
                <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={`Selecteer ${CAPTURE_TYPE_LABELS[c.type]} ${c.seq ?? ""}`} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {current && !annotating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col gap-4 overflow-auto rounded-xl bg-background p-4 md:flex-row" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Capture">
            <div className="md:w-3/5">
              <CaptureMedia c={current} large />
            </div>
            <div className="flex flex-col gap-3 md:w-2/5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {CAPTURE_TYPE_LABELS[current.type]} {current.seq ?? ""}
                </h2>
                <Button size="icon-sm" variant="ghost" onClick={() => setOpen(null)} aria-label="Sluiten">
                  <X />
                </Button>
              </div>
              <CaptureInfo c={current} inspectionId={inspectionId} canEdit={false} />
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {current.type === "photo" || current.type === "sketch" ? (
                    <Button variant="outline" onClick={() => setAnnotating(true)} data-testid="annotate">
                      <PenLine /> Annoteren / vervagen
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => run(() => updateCaptures([current.id], { hiddenInReport: !current.hiddenInReport }))}>
                    {current.hiddenInReport ? <Eye /> : <EyeOff />} {current.hiddenInReport ? "Toon in verslag" : "Verberg uit verslag"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm("Deze capture definitief verwijderen uit de schouw?")) return;
                      await run(() => deleteCaptureAction(current.id), { onSuccess: () => setOpen(null) });
                    }}
                  >
                    <Trash2 /> Verwijderen
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {current && annotating ? (
        <div className="fixed inset-0 z-50">
          <AnnotationEditor
            imageSrc={current.url}
            onCancel={() => setAnnotating(false)}
            saveLabel="Annotatie opslaan"
            onSave={async ({ drawing, rendered }) => {
              const fd = new FormData();
              fd.set("captureId", current.id);
              fd.set("drawing", JSON.stringify(drawing));
              fd.set("rendered", rendered, "annotated.jpg");
              await run(() => saveAnnotation(fd), { onSuccess: () => setAnnotating(false) });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AiProposalBadge, CategoryBadge, PriorityBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { acceptAllProposals, deleteFinding, saveFinding, setFindingField, type FindingInput } from "@/app/(app)/schouwen/actions";
import {
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABELS,
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type FindingCategory,
  type FindingStatus,
  type Priority,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export type FindingRow = {
  id: string;
  seq: number | null;
  title: string;
  description: string;
  category: FindingCategory;
  priority: Priority;
  status: FindingStatus;
  recommendation: string | null;
  source: string;
  aiAccepted: boolean;
  captureIds: string[];
  lat: number | null;
  lon: number | null;
};
type Photo = { id: string; seq: number | null; thumb: string | null };

const SOURCE_LABEL: Record<string, string> = { handmatig: "Handmatig", ai: "AI", transcript: "Uit spraak", asbuilt: "As-built-check", import: "Import" };

function FindingDialog({ inspectionId, initial, photos, onClose }: { inspectionId: string; initial: FindingRow | null; photos: Photo[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState<FindingInput>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "kwaliteit",
    priority: initial?.priority ?? "midden",
    status: initial?.status ?? "open",
    recommendation: initial?.recommendation ?? "",
    captureIds: initial?.captureIds ?? [],
    lat: initial?.lat ?? null,
    lon: initial?.lon ?? null,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Bevinding bewerken" : "Nieuwe bevinding"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Titel" htmlFor="f-title" className="sm:col-span-3">
            <Input id="f-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Prioriteit" htmlFor="f-prio">
            <NativeSelect id="f-prio" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Categorie" htmlFor="f-cat">
            <NativeSelect id="f-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as FindingCategory })}>
              {FINDING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FINDING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="f-status">
            <NativeSelect id="f-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as FindingStatus })}>
              {FINDING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FINDING_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Omschrijving" htmlFor="f-desc" className="sm:col-span-3">
            <Textarea id="f-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Aanbeveling" htmlFor="f-rec" className="sm:col-span-3">
            <Textarea id="f-rec" rows={2} value={f.recommendation ?? ""} onChange={(e) => setF({ ...f, recommendation: e.target.value || null })} />
          </Field>
        </div>
        {photos.length ? (
          <div>
            <p className="mb-2 text-sm font-medium">Gekoppelde foto&apos;s</p>
            <div className="grid grid-cols-6 gap-2">
              {photos.map((p) => {
                const on = f.captureIds?.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setF({ ...f, captureIds: on ? f.captureIds!.filter((x) => x !== p.id) : [...(f.captureIds ?? []), p.id] })}
                    className={cn("relative aspect-square overflow-hidden rounded border", on && "ring-2 ring-primary")}
                    aria-pressed={on}
                    aria-label={`Foto ${p.seq ?? ""}`}
                  >
                    {p.thumb ? <img src={p.thumb} alt="" className="size-full object-cover" loading="lazy" /> : null}
                    <span className="absolute right-0 bottom-0 bg-black/60 px-1 text-[10px] text-white">{p.seq}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button disabled={pending || !f.title.trim()} onClick={() => run(() => saveFinding(inspectionId, initial?.id ?? null, f), { onSuccess: onClose })}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FindingsTable({ inspectionId, findings, photos, canEdit }: { inspectionId: string; findings: FindingRow[]; photos: Photo[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<FindingRow | "new" | null>(null);
  const { run, pending } = useAction();
  const proposals = findings.filter((f) => !f.aiAccepted);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Bevinding
          </Button>
        ) : null}
        {canEdit && proposals.length ? (
          <Button variant="outline" disabled={pending} onClick={() => run(() => acceptAllProposals(inspectionId, "findings"))}>
            <Check /> Alle AI-voorstellen accepteren ({proposals.length})
          </Button>
        ) : null}
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bevinding</TableHead>
              <TableHead>Prioriteit</TableHead>
              <TableHead className="hidden md:table-cell">Categorie</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Foto&apos;s</TableHead>
              <TableHead className="hidden lg:table-cell">Bron</TableHead>
              {canEdit ? <TableHead className="w-28" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Geen bevindingen.
                </TableCell>
              </TableRow>
            ) : (
              findings.map((f) => (
                <TableRow key={f.id} id={`finding-${f.id}`}>
                  <TableCell className="max-w-md">
                    <p className="font-medium">{f.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{f.description}</p>
                    {!f.aiAccepted ? <AiProposalBadge className="mt-1" /> : null}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={f.priority} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <CategoryBadge category={f.category} />
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <NativeSelect value={f.status} onChange={(e) => run(() => setFindingField(f.id, { status: e.target.value }))} className="w-36" aria-label="Status">
                        {FINDING_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {FINDING_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      FINDING_STATUS_LABELS[f.status]
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1">
                      {f.captureIds.slice(0, 4).map((id) => {
                        const p = photos.find((x) => x.id === id);
                        return p?.thumb ? <img key={id} src={p.thumb} alt="" className="size-10 rounded object-cover" loading="lazy" /> : null;
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">{SOURCE_LABEL[f.source] ?? f.source}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex gap-1">
                        {!f.aiAccepted ? (
                          <Button size="icon-sm" variant="ghost" aria-label="Accepteer AI-voorstel" title="Accepteren" onClick={() => run(() => setFindingField(f.id, { aiAccepted: true }))}>
                            <Check />
                          </Button>
                        ) : null}
                        <Button size="icon-sm" variant="ghost" aria-label="Bewerken" onClick={() => setEditing(f)}>
                          <Pencil />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Verwijderen" onClick={() => confirm("Bevinding verwijderen?") && run(() => deleteFinding(f.id))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {editing ? <FindingDialog inspectionId={inspectionId} initial={editing === "new" ? null : editing} photos={photos} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

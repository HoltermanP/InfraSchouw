"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { FINDING_CATEGORIES, FINDING_CATEGORY_LABELS, PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS, type FindingCategory, type Priority } from "@/lib/domain";
import type { KeyPoint, OpenQuestion } from "@/lib/report/types";
import type { CaptureDto } from "@/lib/report/dto";
import { cn } from "@/lib/utils";

export const CAPTURE_DRAG_TYPE = "application/x-infraschouw-capture";

export function PhotoPanel({ captures, usedIds }: { captures: CaptureDto[]; usedIds: Set<string> }) {
  const [onlyUnused, setOnlyUnused] = useState(false);
  const photos = captures.filter((c) => ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport && (!onlyUnused || !usedIds.has(c.id)));
  return (
    <div className="flex flex-col gap-2" data-testid="photo-panel">
      <p className="text-xs text-muted-foreground">Sleep een foto naar de juiste plek in het verslag. Verwijderen uit het verslag verwijdert de foto niet uit de schouw.</p>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox checked={onlyUnused} onCheckedChange={(v) => setOnlyUnused(Boolean(v))} /> Alleen niet-gebruikte foto&apos;s
      </label>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((c) => (
          <li
            key={c.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CAPTURE_DRAG_TYPE, c.id);
              e.dataTransfer.setData("text/plain", `Foto ${c.seq ?? ""}`);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className={cn("relative cursor-grab overflow-hidden rounded border", usedIds.has(c.id) && "opacity-60")}
            title={c.analysis?.caption ?? c.note ?? ""}
            data-testid="panel-photo"
            data-capture-id={c.id}
          >
            {c.thumb ? <img src={c.thumb} alt="" className="aspect-square w-full object-cover" loading="lazy" draggable={false} /> : <div className="aspect-square bg-muted" />}
            <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[10px] text-white">{c.seq ?? "–"}</span>
            {usedIds.has(c.id) ? <Check className="absolute top-1 right-1 size-4 rounded-full bg-emerald-500 p-0.5 text-white" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KeyPointsEditor({ points, onChange, readOnly, findings }: { points: KeyPoint[]; onChange: (p: KeyPoint[]) => void; readOnly: boolean; findings: { id: string; title: string; nr: number }[] }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const update = (i: number, patch: Partial<KeyPoint>) => onChange(points.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= points.length) return;
    const next = [...points];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2" data-testid="key-points">
      {points.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen aandachtspunten.</p> : null}
      {points.map((p, i) => (
        <div
          key={p.id}
          className={cn("rounded-md border p-2", p.source === "ai" && !p.accepted && "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20")}
          draggable={!readOnly}
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null) move(dragIndex, i);
            setDragIndex(null);
          }}
          data-testid="key-point"
        >
          <div className="flex items-center gap-1">
            {!readOnly ? <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden /> : null}
            <span className="size-3 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[p.priority] }} />
            <Input value={p.title} onChange={(e) => update(i, { title: e.target.value })} readOnly={readOnly} className="h-7 text-sm font-medium" aria-label="Titel aandachtspunt" />
          </div>
          <Textarea value={p.description} onChange={(e) => update(i, { description: e.target.value })} readOnly={readOnly} rows={2} className="mt-1 text-xs" aria-label="Omschrijving aandachtspunt" />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <NativeSelect value={p.priority} onChange={(e) => update(i, { priority: e.target.value as Priority })} disabled={readOnly} className="h-7 w-24 text-xs" aria-label="Prioriteit">
              {PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {PRIORITY_LABELS[x]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={p.category} onChange={(e) => update(i, { category: e.target.value as FindingCategory })} disabled={readOnly} className="h-7 w-28 text-xs" aria-label="Categorie">
              {FINDING_CATEGORIES.map((x) => (
                <option key={x} value={x}>
                  {FINDING_CATEGORY_LABELS[x]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={p.findingIds[0] ?? ""}
              onChange={(e) => update(i, { findingIds: e.target.value ? [e.target.value] : [] })}
              disabled={readOnly}
              className="h-7 w-32 text-xs"
              aria-label="Verwijzing naar bevinding"
            >
              <option value="">Geen bevinding</option>
              {findings.map((f) => (
                <option key={f.id} value={f.id}>
                  B{f.nr} {f.title.slice(0, 30)}
                </option>
              ))}
            </NativeSelect>
            {!readOnly ? (
              <span className="ml-auto flex">
                {p.source === "ai" && !p.accepted ? (
                  <Button size="icon-xs" variant="ghost" onClick={() => update(i, { accepted: true })} aria-label="Accepteer" title="AI-voorstel accepteren">
                    <Check />
                  </Button>
                ) : null}
                <Button size="icon-xs" variant="ghost" onClick={() => move(i, i - 1)} aria-label="Omhoog">
                  <ArrowUp />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => move(i, i + 1)} aria-label="Omlaag">
                  <ArrowDown />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => onChange(points.filter((_, j) => j !== i))} aria-label="Verwijder aandachtspunt">
                  <Trash2 />
                </Button>
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {!readOnly ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([...points, { id: `kp-${Date.now()}`, title: "Nieuw aandachtspunt", description: "", priority: "midden", category: "kwaliteit", findingIds: [], captureIds: [], source: "handmatig", accepted: true }])
          }
        >
          <Plus /> Aandachtspunt
        </Button>
      ) : null}
    </div>
  );
}

export function OpenQuestionsPanel({ questions, onChange, readOnly }: { questions: OpenQuestion[]; onChange: (q: OpenQuestion[]) => void; readOnly: boolean }) {
  const open = questions.filter((q) => !q.resolved).length;
  if (questions.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20" data-testid="open-questions">
      <h2 className="mb-2 font-semibold">
        Open vragen van de AI ({open} van {questions.length} open)
      </h2>
      <ul className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <li key={q.id} className="flex items-start gap-2">
            <Checkbox
              checked={q.resolved}
              disabled={readOnly}
              onCheckedChange={(v) => onChange(questions.map((x, j) => (j === i ? { ...x, resolved: Boolean(v) } : x)))}
              aria-label={`Vraag ${i + 1} afgehandeld`}
            />
            <div className="flex-1">
              <p className={cn("text-sm", q.resolved && "text-muted-foreground line-through")}>{q.question}</p>
              <Input
                value={q.answer ?? ""}
                readOnly={readOnly}
                onChange={(e) => onChange(questions.map((x, j) => (j === i ? { ...x, answer: e.target.value || null } : x)))}
                placeholder="Antwoord / verwerking (optioneel)"
                className="mt-1 h-7 text-xs"
                aria-label={`Antwoord op vraag ${i + 1}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

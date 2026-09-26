"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import { assignCaptures, deleteInboxCaptures } from "@/app/(app)/inbox/actions";
import { CAPTURE_SOURCE_LABELS, CAPTURE_TYPE_LABELS, LOCATION_SOURCE_LABELS, type CaptureSourceKind, type CaptureType, type LocationSource } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type InboxRow = { id: string; type: CaptureType; source: CaptureSourceKind; capturedAt: string; thumb: string | null; locationSource: LocationSource; deviceName: string | null; note: string | null };

export function InboxList({ rows, inspections, canEdit }: { rows: InboxRow[]; inspections: { id: string; title: string }[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState(inspections[0]?.id ?? "");
  const { run, pending } = useAction();
  if (rows.length === 0) return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">De inbox is leeg.</p>;
  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.length === rows.length} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} /> Alles
          </label>
          <span className="text-sm text-muted-foreground">{selected.length} geselecteerd</span>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} className="w-80" aria-label="Doelschouw">
            {inspections.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </NativeSelect>
          <Button disabled={pending || !selected.length || !target} onClick={() => run(() => assignCaptures(selected, target), { onSuccess: () => setSelected([]) })} data-testid="assign-inbox">
            Toewijzen aan schouw
          </Button>
          <Button variant="ghost" disabled={pending || !selected.length} onClick={() => confirm("Geselecteerde captures verwijderen?") && run(() => deleteInboxCaptures(selected), { onSuccess: () => setSelected([]) })}>
            <Trash2 /> Verwijderen
          </Button>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="inbox-list">
        {rows.map((r) => (
          <li key={r.id} className={cn("overflow-hidden rounded-lg border", selected.includes(r.id) && "ring-2 ring-primary")}>
            <button type="button" className="block w-full text-left" onClick={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}>
              {r.thumb ? <img src={r.thumb} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <div className="flex aspect-square items-center justify-center bg-muted text-xs">{CAPTURE_TYPE_LABELS[r.type]}</div>}
              <div className="p-2 text-xs">
                <p className="font-medium">
                  {CAPTURE_TYPE_LABELS[r.type]} · {fmtDateTime(r.capturedAt)}
                </p>
                <p className="text-muted-foreground">
                  {r.deviceName ?? CAPTURE_SOURCE_LABELS[r.source]} · {LOCATION_SOURCE_LABELS[r.locationSource]}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

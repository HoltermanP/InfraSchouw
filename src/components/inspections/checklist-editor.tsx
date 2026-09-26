"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import { saveChecklistAnswer } from "@/app/(app)/schouwen/actions";
import type { ChecklistAnswerType } from "@/lib/domain";
import { answerLabel } from "./checklist-labels";

export type ChecklistRow = {
  itemId: string;
  question: string;
  answerType: ChecklistAnswerType;
  options: string[];
  required: boolean;
  photoRequired: boolean;
  value: string | number | null;
  note: string | null;
  skippedReason: string | null;
  photos: { id: string; thumb: string | null; seq: number | null }[];
};


function Row({ inspectionId, row, canEdit }: { inspectionId: string; row: ChecklistRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.value === null ? "" : String(row.value));
  const [note, setNote] = useState(row.note ?? "");
  const { run, pending } = useAction();
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-start">
      <div className="flex-1">
        <p className="font-medium">
          {row.question}
          {row.required ? <span className="text-destructive"> *</span> : null}
        </p>
        {editing ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {row.answerType === "yes_no_na" || row.answerType === "choice" ? (
              <NativeSelect value={value} onChange={(e) => setValue(e.target.value)} className="w-48" aria-label="Antwoord">
                <option value="">—</option>
                {(row.answerType === "yes_no_na" ? ["ja", "nee", "nvt"] : row.options).map((o) => (
                  <option key={o} value={o}>
                    {answerLabel(o)}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input value={value} onChange={(e) => setValue(e.target.value)} className="w-64" aria-label="Antwoord" inputMode={row.answerType === "number" ? "decimal" : undefined} />
            )}
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Toelichting" className="w-72" aria-label="Toelichting" />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => saveChecklistAnswer(inspectionId, row.itemId, { value: value === "" ? null : row.answerType === "number" ? Number(value.replace(",", ".")) : value, note: note || null }), {
                  onSuccess: () => setEditing(false),
                })
              }
            >
              Opslaan
            </Button>
          </div>
        ) : (
          <p className="mt-1 text-sm">
            <span className="font-semibold">{answerLabel(row.value)}</span>
            {row.note ? <span className="text-muted-foreground"> — {row.note}</span> : null}
            {row.skippedReason ? <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">Overgeslagen: {row.skippedReason}</span> : null}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {row.photos.map((p) => (p.thumb ? <img key={p.id} src={p.thumb} alt={`Foto ${p.seq ?? ""}`} className="size-12 rounded object-cover" loading="lazy" /> : null))}
        {row.photoRequired && row.photos.length === 0 ? <span className="text-xs text-destructive">foto verplicht</span> : null}
        {canEdit && !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Bewerken
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ChecklistEditor({ inspectionId, rows, canEdit }: { inspectionId: string; rows: ChecklistRow[]; canEdit: boolean }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Dit schouwtype heeft geen checklist.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="checklist-results">
      {rows.map((r) => (
        <Row key={r.itemId} inspectionId={inspectionId} row={r} canEdit={canEdit} />
      ))}
    </ul>
  );
}

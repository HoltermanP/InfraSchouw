"use client";

import { useState } from "react";
import { Camera, Check, Link2, SkipForward } from "lucide-react";
import type { LocalCapture, LocalChecklistAnswer } from "@/lib/offline/db";
import { answerChecklist } from "@/lib/offline/field-store";
import { cn } from "@/lib/utils";
import type { FieldTemplate } from "./use-bootstrap";
import { CaptureThumb } from "./media";
import { fieldInput } from "./field-sheets";

export function ShotlistPanel({
  template,
  captures,
  activeShotId,
  onPick,
}: {
  template: FieldTemplate;
  captures: LocalCapture[];
  activeShotId: string | null;
  onPick: (shotId: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const c of captures) if (c.shotId) counts.set(c.shotId, (counts.get(c.shotId) ?? 0) + 1);
  const groups = new Map<string, FieldTemplate["shots"]>();
  for (const s of template.shots) groups.set(s.groupName, [...(groups.get(s.groupName) ?? []), s]);
  const missing = template.shots.filter((s) => s.required && !counts.get(s.id)).length;
  if (template.shots.length === 0) return <p className="text-sm text-white/60">Dit schouwtype heeft geen shotlist.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className={cn("rounded-lg px-3 py-2 text-sm font-semibold", missing ? "bg-amber-400/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300")} data-testid="shotlist-status">
        {missing ? `${missing} verplichte foto's ontbreken nog` : "Alle verplichte foto's zijn gemaakt"}
      </p>
      {[...groups.entries()].map(([group, shots]) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-white/60 uppercase">{group}</h3>
          <ol className="flex flex-col gap-1.5">
            {shots.map((s) => {
              const n = counts.get(s.id) ?? 0;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s.id)}
                    className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left", activeShotId === s.id ? "bg-amber-400 text-black" : "bg-white/10")}
                  >
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", n ? "bg-emerald-500 text-black" : s.required ? "bg-red-500/80" : "bg-white/20")}>
                      {n ? <Check className="size-4" /> : template.shots.indexOf(s) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{s.title}</span>
                      {s.description ? <span className="block text-xs opacity-70">{s.description}</span> : null}
                    </span>
                    <span className="text-xs opacity-70">{n ? `${n} foto${n > 1 ? "'s" : ""}` : s.required ? "verplicht" : "optioneel"}</span>
                    <Camera className="size-4 shrink-0 opacity-70" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function ChecklistItem({
  item,
  answer,
  inspectionId,
  photos,
}: {
  item: FieldTemplate["checklist"][number];
  answer: LocalChecklistAnswer | undefined;
  inspectionId: string;
  photos: LocalCapture[];
}) {
  const [note, setNote] = useState(answer?.note ?? "");
  const [linking, setLinking] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState(answer?.skippedReason ?? "");
  const save = (patch: Partial<{ value: string | number | null; note: string | null; skippedReason: string | null; captureIds: string[] }>) =>
    answerChecklist(inspectionId, item.id, {
      value: patch.value !== undefined ? patch.value : (answer?.value ?? null),
      note: patch.note !== undefined ? patch.note : (answer?.note ?? null),
      skippedReason: patch.skippedReason !== undefined ? patch.skippedReason : (answer?.skippedReason ?? null),
      captureIds: patch.captureIds ?? answer?.captureIds ?? [],
    });
  const value = answer?.value ?? null;
  const linked = answer?.captureIds ?? [];
  const btn = (v: string, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => save({ value: v, skippedReason: null })}
      aria-pressed={value === v}
      className={cn("min-h-12 flex-1 rounded-xl text-sm font-semibold", value === v ? "bg-amber-400 text-black" : "bg-white/10")}
    >
      {label}
    </button>
  );
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-white/5 p-3" data-testid="checklist-item">
      <p className="font-medium">
        {item.question}
        {item.required ? <span className="text-amber-400"> *</span> : null}
        {item.photoRequired ? <span className="ml-2 rounded bg-white/10 px-1.5 text-xs">foto verplicht</span> : null}
      </p>
      {item.answerType === "yes_no_na" ? (
        <div className="flex gap-2">{[btn("ja", "Ja"), btn("nee", "Nee"), btn("nvt", "N.v.t.")]}</div>
      ) : item.answerType === "choice" ? (
        <div className="flex flex-wrap gap-2">{item.options.map((o) => btn(o, o))}</div>
      ) : item.answerType === "number" ? (
        <input className={fieldInput} inputMode="decimal" defaultValue={value ?? ""} onBlur={(e) => e.target.value !== "" && save({ value: Number(e.target.value.replace(",", ".")), skippedReason: null })} aria-label={item.question} />
      ) : (
        <textarea className={`${fieldInput} py-2`} rows={2} defaultValue={value ?? ""} onBlur={(e) => save({ value: e.target.value || null, skippedReason: null })} aria-label={item.question} />
      )}
      <input className={`${fieldInput} min-h-10 text-sm`} placeholder="Toelichting (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (answer?.note ?? "") && save({ note: note || null })} aria-label={`Toelichting bij ${item.question}`} />
      {linked.length ? (
        <div className="flex gap-1">
          {linked.map((id) => {
            const p = photos.find((x) => x.id === id);
            return p ? <CaptureThumb key={id} capture={p} className="size-12 rounded" /> : null;
          })}
        </div>
      ) : null}
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setLinking((v) => !v)} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
          <Link2 className="size-3.5" /> Foto koppelen
        </button>
        <button type="button" onClick={() => setSkipping((v) => !v)} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
          <SkipForward className="size-3.5" /> Overslaan
        </button>
        {answer?.skippedReason ? <span className="self-center text-amber-300">Overgeslagen: {answer.skippedReason}</span> : null}
      </div>
      {linking ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.slice(0, 20).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => save({ captureIds: linked.includes(p.id) ? linked.filter((x) => x !== p.id) : [...linked, p.id] })}
              className={cn("size-16 shrink-0 overflow-hidden rounded-lg", linked.includes(p.id) && "ring-4 ring-amber-400")}
            >
              <CaptureThumb capture={p} className="size-full" />
            </button>
          ))}
          {photos.length === 0 ? <span className="text-xs text-white/60">Nog geen foto&apos;s.</span> : null}
        </div>
      ) : null}
      {skipping ? (
        <div className="flex gap-2">
          <input className={`${fieldInput} min-h-10 text-sm`} placeholder="Reden" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reden overslaan" />
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => {
              void save({ skippedReason: reason.trim(), value: null });
              setSkipping(false);
            }}
            className="rounded-lg bg-amber-400 px-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            Opslaan
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ChecklistPanel({ template, answers, inspectionId, photos }: { template: FieldTemplate; answers: LocalChecklistAnswer[]; inspectionId: string; photos: LocalCapture[] }) {
  if (template.checklist.length === 0) return <p className="text-sm text-white/60">Dit schouwtype heeft geen checklist.</p>;
  const done = template.checklist.filter((c) => answers.some((a) => a.itemId === c.id && (a.value !== null || a.skippedReason))).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/70">
        {done} van {template.checklist.length} beantwoord
      </p>
      <ul className="flex flex-col gap-2">
        {template.checklist.map((item) => (
          <ChecklistItem key={item.id} item={item} answer={answers.find((a) => a.itemId === item.id)} inspectionId={inspectionId} photos={photos} />
        ))}
      </ul>
    </div>
  );
}

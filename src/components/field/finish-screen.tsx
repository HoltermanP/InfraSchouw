"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Eraser, PenLine, Plus } from "lucide-react";
import { getLocalDb } from "@/lib/offline/db";
import { finishInspection, saveParticipant } from "@/lib/offline/field-store";
import { cn } from "@/lib/utils";
import type { Bootstrap } from "./use-bootstrap";
import type { FieldRoute } from "./nav";
import { fieldInput } from "./field-sheets";

function SignaturePad({ onSave, onCancel }: { onSave: (b: Blob) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        width={800}
        height={300}
        className="w-full touch-none rounded-xl bg-white"
        aria-label="Handtekening"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#0f172a";
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => {
          canvas.current!.getContext("2d")!.clearRect(0, 0, 800, 300);
          setEmpty(true);
        }} className="flex min-h-12 items-center gap-1 rounded-xl bg-white/10 px-3">
          <Eraser className="size-4" /> Wissen
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl bg-white/10 px-3">
          Annuleren
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => canvas.current!.toBlob((b) => b && onSave(b), "image/png")}
          className="min-h-12 flex-1 rounded-xl bg-amber-400 font-semibold text-black disabled:opacity-40"
        >
          Handtekening opslaan
        </button>
      </div>
    </div>
  );
}

export function FinishScreen({ data, inspectionId, go }: { data: Bootstrap; inspectionId: string; go: (r: FieldRoute, replace?: boolean) => void }) {
  const db = getLocalDb();
  const inspection = useLiveQuery(() => db.inspections.get(inspectionId), [inspectionId]);
  const captures = useLiveQuery(() => db.captures.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]) ?? [];
  const answers = useLiveQuery(() => db.answers.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]) ?? [];
  const participants = useLiveQuery(() => db.participants.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]) ?? [];
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [signing, setSigning] = useState<string | null>(null);
  const [newP, setNewP] = useState({ name: "", organization: "", role: "" });
  const [busy, setBusy] = useState(false);
  const identity = { orgId: data.org.id, userId: data.user.id };

  const template = data.templates.find((t) => t.id === inspection?.templateId);
  if (!inspection || !template) return <p className="p-6 text-center text-white/70">Laden…</p>;

  const missingShots = template.shots.filter((s) => s.required && !captures.some((c) => c.shotId === s.id));
  const openItems = template.checklist.filter((c) => {
    if (!c.required) return false;
    const a = answers.find((x) => x.itemId === c.id);
    return !a || (a.value === null && !a.skippedReason) || (c.photoRequired && a.captureIds.length === 0 && !a.skippedReason);
  });
  const openKeys = [...missingShots.map((s) => `shot:${s.id}`), ...openItems.map((c) => `checklist:${c.id}`)];
  const unresolved = openKeys.filter((k) => !reasons[k]?.trim());

  async function finish() {
    setBusy(true);
    const skipped = openKeys.map((k) => {
      const [kind, refId] = k.split(":") as ["shot" | "checklist", string];
      return { kind, refId, reason: reasons[k]!.trim() };
    });
    await finishInspection(inspectionId, skipped, notes || null);
    go({ view: "inspection", id: inspectionId, step: "vastleggen" }, true);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-32">
      <button type="button" onClick={() => go({ view: "inspection", id: inspectionId, step: "vastleggen" })} className="flex items-center gap-1 self-start text-sm text-white/70">
        <ArrowLeft className="size-4" /> Terug naar vastleggen
      </button>
      <h1 className="text-2xl font-bold">Schouw afronden</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Controle</h2>
        {openKeys.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-600/20 p-3 text-emerald-300" data-testid="finish-complete">
            <Check className="size-5" /> Alle verplichte foto&apos;s en checklistvragen zijn afgehandeld.
          </p>
        ) : (
          <>
            <p className="text-sm text-amber-300">Onderstaande punten ontbreken. Vul ze aan, of sla ze bewust over met een reden.</p>
            {missingShots.map((s) => (
              <div key={s.id} className="rounded-xl bg-white/5 p-3">
                <p className="text-sm">
                  <span className="rounded bg-red-600/70 px-1.5 text-xs">foto ontbreekt</span> {s.groupName} – {s.title}
                </p>
                <input className={cn(fieldInput, "mt-2 min-h-10 text-sm")} placeholder="Reden om over te slaan" aria-label={`Reden overslaan ${s.title}`} value={reasons[`shot:${s.id}`] ?? ""} onChange={(e) => setReasons({ ...reasons, [`shot:${s.id}`]: e.target.value })} />
              </div>
            ))}
            {openItems.map((c) => (
              <div key={c.id} className="rounded-xl bg-white/5 p-3">
                <p className="text-sm">
                  <span className="rounded bg-red-600/70 px-1.5 text-xs">checklist open</span> {c.question}
                </p>
                <input className={cn(fieldInput, "mt-2 min-h-10 text-sm")} placeholder="Reden om over te slaan" aria-label={`Reden overslaan ${c.question}`} value={reasons[`checklist:${c.id}`] ?? ""} onChange={(e) => setReasons({ ...reasons, [`checklist:${c.id}`]: e.target.value })} />
              </div>
            ))}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Deelnemers en handtekeningen (optioneel)</h2>
        {participants.map((p) => (
          <div key={p.id} className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p>
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm text-white/60">{[p.organization, p.role].filter(Boolean).length ? ` · ${[p.organization, p.role].filter(Boolean).join(" · ")}` : ""}</span>
              </p>
              {p.signedAt ? (
                <span className="flex items-center gap-1 text-sm text-emerald-300">
                  <Check className="size-4" /> Getekend
                </span>
              ) : (
                <button type="button" onClick={() => setSigning(p.id)} className="flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-3 text-sm">
                  <PenLine className="size-4" /> Laten tekenen
                </button>
              )}
            </div>
            {signing === p.id ? (
              <div className="mt-3">
                <SignaturePad
                  onCancel={() => setSigning(null)}
                  onSave={async (blob) => {
                    await saveParticipant(identity, { id: p.id, inspectionId, name: p.name, organization: p.organization, role: p.role, signature: blob });
                    setSigning(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <input className={fieldInput} placeholder="Naam" aria-label="Naam nieuwe deelnemer" value={newP.name} onChange={(e) => setNewP({ ...newP, name: e.target.value })} />
          <input className={fieldInput} placeholder="Organisatie" aria-label="Organisatie nieuwe deelnemer" value={newP.organization} onChange={(e) => setNewP({ ...newP, organization: e.target.value })} />
          <input className={fieldInput} placeholder="Rol" aria-label="Rol nieuwe deelnemer" value={newP.role} onChange={(e) => setNewP({ ...newP, role: e.target.value })} />
          <button
            type="button"
            aria-label="Deelnemer toevoegen"
            disabled={!newP.name.trim()}
            onClick={async () => {
              await saveParticipant(identity, { inspectionId, name: newP.name.trim(), organization: newP.organization || null, role: newP.role || null });
              setNewP({ name: "", organization: "", role: "" });
            }}
            className="min-h-12 rounded-xl bg-white/10 px-3 disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Slotopmerking (optioneel)</h2>
        <textarea className={`${fieldInput} py-2`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Slotopmerking" />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-neutral-950/95 p-4">
        <button
          type="button"
          onClick={finish}
          disabled={busy || unresolved.length > 0}
          className="mx-auto flex min-h-16 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xl font-bold text-black disabled:opacity-40"
          data-testid="finish-inspection"
        >
          <Check className="size-6" /> {unresolved.length ? `Nog ${unresolved.length} punt(en) open` : "Schouw afronden"}
        </button>
      </div>
    </div>
  );
}

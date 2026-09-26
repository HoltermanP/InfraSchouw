"use client";

import { useState } from "react";
import { X, Mic, Square, Trash2, MapPin, PenLine } from "lucide-react";
import { FINDING_CATEGORIES, FINDING_CATEGORY_LABELS, MEASUREMENT_KINDS, MEASUREMENT_KIND_LABELS, MEASUREMENT_UNITS, PRIORITIES, PRIORITY_LABELS, LOCATION_SOURCE_LABELS, type FindingCategory, type Priority } from "@/lib/domain";
import type { LocalCapture } from "@/lib/offline/db";
import { formatRd, formatWgs84, headingLabel, wgs84ToRd } from "@/lib/geo/rd";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LazyMap } from "@/components/map/lazy-map";
import { CaptureThumb, useCaptureUrl } from "./media";
import { QUICK_TAGS } from "./camera-overlay";

export const fieldInput = "min-h-12 w-full rounded-xl bg-white/10 px-3 text-base text-white outline-none focus:ring-2 focus:ring-amber-400";

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white" role="dialog" aria-label={title}>
      <div className="flex items-center justify-between border-b border-white/10 p-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white/10" aria-label="Sluiten">
          <X className="size-6" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer ? <div className="border-t border-white/10 p-3">{footer}</div> : null}
    </div>
  );
}

export function PrimaryButton({ children, className, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn("min-h-14 w-full rounded-2xl bg-amber-400 text-lg font-bold text-black disabled:opacity-40", className)} {...props}>
      {children}
    </button>
  );
}

export function NoteSheet({ onSave, onClose, initial = "" }: { onSave: (text: string) => Promise<void>; onClose: () => void; initial?: string }) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      title="Tekstnotitie"
      onClose={onClose}
      footer={
        <PrimaryButton disabled={!text.trim()} onClick={() => onSave(text.trim())} data-testid="save-note">
          Notitie opslaan
        </PrimaryButton>
      }
    >
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${fieldInput} py-3`} placeholder="Wat wil je vastleggen?" aria-label="Notitie" />
    </Sheet>
  );
}

export function MeasurementSheet({
  photos,
  onSave,
  onClose,
}: {
  photos: LocalCapture[];
  onSave: (m: { kind: string; label: string; value: number; unit: string; photoCaptureId: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>("diepte");
  const [label, setLabel] = useState("Diepte kabel");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("cm");
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const num = Number(value.replace(",", "."));
  return (
    <Sheet
      title="Meting"
      onClose={onClose}
      footer={
        <PrimaryButton disabled={!value || !Number.isFinite(num)} onClick={() => onSave({ kind, label: label.trim() || kind, value: num, unit, photoCaptureId: photoId })} data-testid="save-measurement">
          Meting opslaan
        </PrimaryButton>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {MEASUREMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setLabel(MEASUREMENT_KIND_LABELS[k]);
                setUnit(k === "aantal" ? "st" : k === "lengte" ? "m" : "cm");
              }}
              className={cn("min-h-12 rounded-xl", kind === k ? "bg-amber-400 text-black" : "bg-white/10")}
            >
              {MEASUREMENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <input className={fieldInput} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Omschrijving" placeholder="Omschrijving (bijv. diepte kabel)" />
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <input className={`${fieldInput} text-2xl font-bold`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Waarde" placeholder="0" autoFocus />
          <select className={fieldInput} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Eenheid">
            {MEASUREMENT_UNITS.map((u) => (
              <option key={u} value={u} className="text-black">
                {u}
              </option>
            ))}
          </select>
        </div>
        {photos.length ? (
          <div>
            <p className="mb-2 text-sm text-white/70">Koppel aan foto (bijv. foto met duimstok)</p>
            <div className="flex gap-2 overflow-x-auto">
              <button type="button" onClick={() => setPhotoId(null)} className={cn("flex size-20 shrink-0 items-center justify-center rounded-lg text-xs", photoId === null ? "ring-4 ring-amber-400" : "bg-white/10")}>
                Geen
              </button>
              {photos.slice(0, 12).map((p) => (
                <button key={p.id} type="button" onClick={() => setPhotoId(p.id)} className={cn("size-20 shrink-0 overflow-hidden rounded-lg", photoId === p.id && "ring-4 ring-amber-400")}>
                  <CaptureThumb capture={p} className="size-full" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

export function FindingSheet({
  photos,
  initialPriority = "midden",
  initialText = "",
  onSave,
  onClose,
}: {
  photos: LocalCapture[];
  initialPriority?: Priority;
  initialText?: string;
  onSave: (f: { title: string; description: string; category: FindingCategory; priority: Priority; captureIds: string[] }) => Promise<void>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<FindingCategory>("kwaliteit");
  const [priority, setPriority] = useState<Priority>(initialPriority);
  const [description, setDescription] = useState(initialText);
  const [selected, setSelected] = useState<string[]>(photos[0] ? [photos[0].id] : []);
  const title = description.split(/[.\n]/)[0]!.slice(0, 120);
  return (
    <Sheet
      title="Bevinding"
      onClose={onClose}
      footer={
        <PrimaryButton disabled={!description.trim()} onClick={() => onSave({ title: title || "Bevinding", description: description.trim(), category, priority, captureIds: selected })} data-testid="save-finding">
          Bevinding opslaan
        </PrimaryButton>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioriteit">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={priority === p}
              onClick={() => setPriority(p)}
              className={cn("min-h-14 rounded-xl text-lg font-bold", priority === p ? (p === "hoog" ? "bg-red-600" : p === "midden" ? "bg-amber-500 text-black" : "bg-emerald-600") : "bg-white/10")}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FINDING_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={cn("min-h-12 rounded-xl text-sm", category === c ? "bg-amber-400 text-black" : "bg-white/10")}>
              {FINDING_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${fieldInput} py-3`} placeholder="Omschrijving (eerste zin wordt de titel)" aria-label="Omschrijving bevinding" autoFocus />
        {photos.length ? (
          <div>
            <p className="mb-2 text-sm text-white/70">Gekoppelde foto&apos;s</p>
            <div className="flex gap-2 overflow-x-auto">
              {photos.slice(0, 16).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected.includes(p.id)}
                  onClick={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                  className={cn("size-20 shrink-0 overflow-hidden rounded-lg", selected.includes(p.id) && "ring-4 ring-amber-400")}
                >
                  <CaptureThumb capture={p} className="size-full" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

export function CaptureDetailSheet({
  capture,
  shots,
  onClose,
  onUpdate,
  onDelete,
  onVoiceNote,
  onAnnotate,
  recordingVoice,
  accuracyWarning,
}: {
  capture: LocalCapture;
  shots: { id: string; groupName: string; title: string }[];
  onClose: () => void;
  onUpdate: (patch: Partial<Pick<LocalCapture, "lat" | "lon" | "locationSource" | "note" | "tags" | "shotId">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onVoiceNote: () => void;
  onAnnotate: () => void;
  recordingVoice: boolean;
  accuracyWarning: number;
}) {
  const url = useCaptureUrl(capture, "orig");
  const [note, setNote] = useState(capture.note ?? "");
  const [editLocation, setEditLocation] = useState(false);
  const rd = capture.lat !== null && capture.lon !== null ? wgs84ToRd(capture.lat, capture.lon) : null;
  return (
    <Sheet title={`${capture.type === "photo" ? "Foto" : "Capture"} · ${fmtTime(capture.capturedAt, true)}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {capture.type === "photo" || capture.type === "sketch" ? (
          url ? <img src={url} alt="" className="max-h-[45vh] w-full rounded-xl object-contain" /> : null
        ) : capture.type === "video" ? (
          url ? <video src={url} controls className="max-h-[45vh] w-full rounded-xl" /> : null
        ) : capture.type === "audio" ? (
          url ? <audio src={url} controls className="w-full" /> : null
        ) : (
          <p className="rounded-xl bg-white/10 p-4">{capture.textContent}</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p>
            <span className="block text-xs text-white/50">WGS84</span>
            {formatWgs84(capture.lat, capture.lon)}
          </p>
          <p>
            <span className="block text-xs text-white/50">RD (EPSG:28992)</span>
            {rd ? formatRd(rd.x, rd.y) : "—"}
          </p>
          <p>
            <span className="block text-xs text-white/50">Nauwkeurigheid</span>
            <span className={cn(capture.accuracy !== null && capture.accuracy > accuracyWarning && "font-bold text-amber-400")}>
              {capture.accuracy !== null ? `± ${Math.round(capture.accuracy)} m` : "—"}
            </span>{" "}
            <span className="text-white/50">({LOCATION_SOURCE_LABELS[capture.locationSource]})</span>
          </p>
          <p>
            <span className="block text-xs text-white/50">Kijkrichting</span>
            {headingLabel(capture.heading)}
          </p>
        </div>
        <button type="button" onClick={() => setEditLocation((v) => !v)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/10">
          <MapPin className="size-4" /> {editLocation ? "Klaar met locatie" : "Locatie corrigeren op kaart"}
        </button>
        {editLocation ? (
          <div className="h-72">
            <LazyMap
              className="h-full"
              captures={capture.lat !== null && capture.lon !== null ? [{ id: capture.id, type: capture.type, lat: capture.lat, lon: capture.lon, seq: null, heading: capture.heading }] : []}
              draggableCaptureId={capture.id}
              onCaptureDragEnd={(_id, lat, lon) => void onUpdate({ lat, lon, locationSource: "manual" })}
              showUserLocation
            />
            <p className="mt-1 text-xs text-white/60">Sleep de marker naar de juiste plek.</p>
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          Notitie
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (capture.note ?? "") && onUpdate({ note: note || null })} rows={3} className={`${fieldInput} py-2`} />
        </label>
        <div className="flex flex-wrap gap-1">
          {QUICK_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={capture.tags.includes(t)}
              onClick={() => onUpdate({ tags: capture.tags.includes(t) ? capture.tags.filter((x) => x !== t) : [...capture.tags, t] })}
              className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", capture.tags.includes(t) ? "bg-amber-400 text-black" : "bg-white/10")}
            >
              {t}
            </button>
          ))}
        </div>
        {shots.length ? (
          <label className="flex flex-col gap-1 text-sm">
            Shotlist-item
            <select className={fieldInput} value={capture.shotId ?? ""} onChange={(e) => onUpdate({ shotId: e.target.value || null })}>
              <option value="" className="text-black">
                Geen
              </option>
              {shots.map((s) => (
                <option key={s.id} value={s.id} className="text-black">
                  {s.groupName} – {s.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {capture.type === "photo" ? (
            <button type="button" onClick={onVoiceNote} className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl text-xs", recordingVoice ? "bg-red-600" : "bg-white/10")}>
              {recordingVoice ? <Square className="size-5" /> : <Mic className="size-5" />}
              {recordingVoice ? "Stop spraaknotitie" : "Spraaknotitie"}
            </button>
          ) : null}
          {capture.type === "photo" ? (
            <button type="button" onClick={onAnnotate} className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-white/10 text-xs">
              <PenLine className="size-5" /> Tekenen op foto
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              if (confirm("Deze capture verwijderen?")) await onDelete();
            }}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-red-900/60 text-xs"
          >
            <Trash2 className="size-5" /> Verwijderen
          </button>
        </div>
      </div>
    </Sheet>
  );
}

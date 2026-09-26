"use client";

import { useState } from "react";
import { Upload, AlertTriangle, MapPin } from "lucide-react";
import { draftsFromFiles } from "@/lib/capture-sources/file-import";
import type { CaptureDraft } from "@/lib/capture-sources/types";
import { getLocalDb } from "@/lib/offline/db";
import { LOCATION_SOURCE_LABELS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { Sheet, PrimaryButton } from "./field-sheets";

type Item = { draft: CaptureDraft; file: File; warning: string | null; preview: string | null; include: boolean };

/** Bulk import from gallery / glasses storage: EXIF + time matching, preview before confirming. */
export function ImportSheet({ inspectionId, onImport, onClose }: { inspectionId: string; onImport: (drafts: CaptureDraft[]) => Promise<void>; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function add(files: FileList | File[] | null) {
    if (!files) return;
    setBusy(true);
    const points = await getLocalDb().gpsPoints.where("inspectionId").equals(inspectionId).toArray();
    const track = points.map((p) => ({ lat: p.lat, lon: p.lon, t: p.t, accuracy: p.accuracy }));
    const results = await draftsFromFiles(Array.from(files), { track });
    setItems((cur) => [
      ...cur,
      ...results.map((r) => ({
        ...r,
        include: Boolean(r.draft.id),
        preview: r.draft.thumb ? URL.createObjectURL(r.draft.thumb) : null,
      })),
    ]);
    setBusy(false);
  }

  const selected = items.filter((i) => i.include && i.draft.id);
  return (
    <Sheet
      title="Importeren uit galerij of brilgeheugen"
      onClose={onClose}
      footer={
        <PrimaryButton
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            await onImport(selected.map((i) => i.draft));
            onClose();
          }}
        >
          {selected.length} bestand(en) importeren
        </PrimaryButton>
      }
    >
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${dragging ? "border-amber-400 bg-amber-400/10" : "border-white/30"}`}
      >
        <Upload className="size-8" />
        <span>Sleep foto&apos;s, video&apos;s of audio hierheen of tik om te kiezen</span>
        <input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => add(e.target.files)} aria-label="Bestanden kiezen" />
      </label>
      {busy ? <p className="mt-3 text-sm text-white/70">Bestanden verwerken (EXIF, voorbeelden)…</p> : null}
      <ul className="mt-4 flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
            <input
              type="checkbox"
              className="size-6"
              checked={it.include}
              disabled={!it.draft.id}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
              aria-label={`Importeer ${it.file.name}`}
            />
            {it.preview ? <img src={it.preview} alt="" className="size-14 rounded object-cover" /> : <div className="size-14 rounded bg-white/10" />}
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate text-sm font-medium">{it.file.name}</p>
              <p className="text-white/60">{fmtDateTime(it.draft.capturedAt)}</p>
              <p className="flex items-center gap-1 text-white/60">
                <MapPin className="size-3" /> {LOCATION_SOURCE_LABELS[it.draft.locationSource]}
                {it.draft.lat !== null ? ` · ${it.draft.lat.toFixed(5)}, ${it.draft.lon?.toFixed(5)}` : ""}
              </p>
              {it.warning ? (
                <p className="flex items-center gap-1 text-amber-300">
                  <AlertTriangle className="size-3" /> {it.warning}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

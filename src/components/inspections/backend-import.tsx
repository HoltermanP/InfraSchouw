"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { draftsFromFiles } from "@/lib/capture-sources/file-import";
import type { CaptureDraft } from "@/lib/capture-sources/types";
import { LOCATION_SOURCE_LABELS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

type Item = { draft: CaptureDraft; file: File; warning: string | null; preview: string | null };

/** Bulk import from gallery / glasses storage into an inspection or the inbox (EXIF + preview). */
export function BackendImport({ inspectionId, label = "Importeren" }: { inspectionId: string | null; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const res = await draftsFromFiles(Array.from(files));
    setItems((cur) => [...cur, ...res.filter((r) => r.draft.id).map((r) => ({ ...r, preview: r.draft.thumb ? URL.createObjectURL(r.draft.thumb) : null }))]);
    setBusy(false);
  }

  async function upload() {
    setBusy(true);
    let ok = 0;
    for (const [i, it] of items.entries()) {
      const fd = new FormData();
      fd.set("file", it.file);
      fd.set("clientId", it.draft.id);
      fd.set("capturedAt", it.draft.capturedAt.toISOString());
      if (it.draft.lat !== null && it.draft.lon !== null) {
        fd.set("lat", String(it.draft.lat));
        fd.set("lon", String(it.draft.lon));
      }
      if (it.draft.heading !== null) fd.set("heading", String(it.draft.heading));
      if (it.draft.durationMs) fd.set("durationMs", String(it.draft.durationMs));
      if (inspectionId) fd.set("inspectionId", inspectionId);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      if (res.ok) ok++;
      setProgress(Math.round(((i + 1) / items.length) * 100));
    }
    setBusy(false);
    toast.success(`${ok} van ${items.length} bestand(en) geïmporteerd`);
    setItems([]);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="backend-import">
        <Upload /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bestanden importeren</DialogTitle>
            <DialogDescription>
              Foto&apos;s, video&apos;s en audio uit de galerij of het geheugen van een bril. Locatie komt uit EXIF; zonder EXIF-GPS wordt de locatie bepaald via de tijd en de GPS-track van de schouw.
            </DialogDescription>
          </DialogHeader>
          <label
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files);
            }}
          >
            <Upload className="size-6" /> Sleep bestanden hierheen of klik om te kiezen
            <input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => pick(e.target.files)} aria-label="Bestanden kiezen" />
          </label>
          <ul className="flex flex-col gap-2">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 rounded border p-2 text-xs">
                {it.preview ? <img src={it.preview} alt="" className="size-12 rounded object-cover" /> : <div className="size-12 rounded bg-muted" />}
                <div className="flex-1">
                  <p className="font-medium">{it.file.name}</p>
                  <p className="text-muted-foreground">
                    {fmtDateTime(it.draft.capturedAt)} · {LOCATION_SOURCE_LABELS[it.draft.locationSource]}
                  </p>
                  {it.warning ? (
                    <p className="flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="size-3" /> {it.warning}
                      {inspectionId ? " — wordt server-side op de GPS-track gematcht" : ""}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {busy && progress ? <p className="text-sm">Uploaden… {progress}%</p> : null}
          <DialogFooter>
            <Button disabled={busy || items.length === 0} onClick={upload}>
              {items.length} bestand(en) importeren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

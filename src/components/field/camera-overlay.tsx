"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Circle, Square, X, Images, Footprints } from "lucide-react";
import { PhoneCameraSource, photoFromFile, type PhotoResult, type VideoResult } from "@/lib/capture-sources/phone-camera";
import type { GeoFix } from "@/lib/capture-sources/types";
import { distanceMeters } from "@/lib/geo/rd";
import { vibrate } from "@/lib/media/client";
import { cn } from "@/lib/utils";

export const QUICK_TAGS = ["schade", "obstakel", "boom", "kruising", "verharding", "sleuf", "typeplaat", "veiligheid", "afwerking"];

export type CameraMode = "photo" | "series" | "video";

export type CameraHandle = { takePhoto: () => void; startVideo: () => void; stopVideo: () => void };

export function CameraOverlay({
  mode: initialMode,
  source,
  currentFix,
  shotTitle,
  maxVideoSeconds,
  keyframeSeconds,
  onPhoto,
  onVideo,
  onClose,
  handleRef,
}: {
  mode: CameraMode;
  source: PhoneCameraSource;
  currentFix: () => GeoFix | null;
  shotTitle: string | null;
  maxVideoSeconds: number;
  keyframeSeconds: number;
  onPhoto: (p: PhotoResult, meta: { tags: string[]; fix: GeoFix | null; capturedAt: Date; seriesId: string | null }) => Promise<void>;
  onVideo: (v: VideoResult, meta: { tags: string[]; track: { lat: number; lon: number; t: number }[]; startedAt: Date; fix: GeoFix | null }) => Promise<void>;
  onClose: () => void;
  handleRef?: React.MutableRefObject<CameraHandle | null>;
}) {
  const videoEl = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CameraMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [seriesMeters, setSeriesMeters] = useState(10);
  const [seriesAuto, setSeriesAuto] = useState(false);
  const seriesId = useRef<string>(crypto.randomUUID());
  const lastSeriesFix = useRef<GeoFix | null>(null);
  const trackRef = useRef<{ lat: number; lon: number; t: number }[]>([]);
  const startedAt = useRef<Date | null>(null);
  const busy = useRef(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await source.isAvailable())) {
        setError("Camera niet beschikbaar in deze browser; gebruik de knop om een foto te kiezen.");
        return;
      }
      try {
        await source.start(videoEl.current!, mode === "video");
      } catch (err) {
        if (!cancelled) setError(`Camera kon niet worden gestart (${(err as Error).name}). Gebruik de telefooncamera-knop.`);
      }
    })();
    return () => {
      cancelled = true;
      source.stop();
    };
    // Restart the stream when switching to/from video (audio track needed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode === "video"]);

  async function shoot() {
    if (busy.current || !source.active) return;
    busy.current = true;
    try {
      const capturedAt = new Date();
      const fix = currentFix();
      const photo = await source.takePhoto();
      setFlash(true);
      vibrate(40);
      setTimeout(() => setFlash(false), 150);
      await onPhoto(photo, { tags, fix, capturedAt, seriesId: mode === "series" ? seriesId.current : null });
      if (mode === "series") lastSeriesFix.current = fix;
      setCount((c) => c + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      busy.current = false;
    }
  }

  async function onFile(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const photo = await photoFromFile(f);
      await onPhoto(photo, { tags, fix: currentFix(), capturedAt: new Date(), seriesId: null });
      setCount((c) => c + 1);
    }
  }

  async function startVideo() {
    if (recording || !source.active) return;
    trackRef.current = [];
    startedAt.current = new Date();
    await source.startVideo();
    setRecording(true);
    setElapsed(0);
    vibrate([40, 40, 40]);
    maxTimer.current = setTimeout(() => void stopVideoRef.current(), maxVideoSeconds * 1000);
  }

  async function stopVideo() {
    if (!source.recording) return;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    setRecording(false);
    const result = await source.stopVideo(keyframeSeconds);
    vibrate(80);
    await onVideo(result, { tags, track: trackRef.current, startedAt: startedAt.current ?? new Date(), fix: currentFix() });
    setCount((c) => c + 1);
  }

  // Video timer, GPS track during recording and max duration.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
      const f = currentFix();
      if (f) trackRef.current.push({ lat: f.lat, lon: f.lon, t: Date.now() });
    }, 1000);
    return () => clearInterval(timer);
  }, [recording, currentFix]);

  // Series mode: automatic photo every X metres.
  useEffect(() => {
    if (mode !== "series" || !seriesAuto) return;
    const timer = setInterval(() => {
      const f = currentFix();
      if (!f) return;
      const last = lastSeriesFix.current;
      if (!last || distanceMeters(last, f) >= seriesMeters) void shoot();
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seriesAuto, seriesMeters]);

  const stopVideoRef = useRef(stopVideo);
  useEffect(() => {
    stopVideoRef.current = stopVideo;
  });
  useEffect(() => {
    if (handleRef) handleRef.current = { takePhoto: () => void shoot(), startVideo: () => void startVideo(), stopVideo: () => void stopVideo() };
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Camera">
      <div className="flex items-center justify-between gap-2 p-3">
        <button type="button" onClick={onClose} className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white/15" aria-label="Camera sluiten">
          <X className="size-6" />
        </button>
        <div className="flex gap-1 rounded-full bg-white/10 p-1 text-sm font-semibold">
          {(
            [
              ["photo", "Foto"],
              ["series", "Serie"],
              ["video", "Video"],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" disabled={recording} onClick={() => setMode(m)} className={cn("rounded-full px-4 py-2", mode === m ? "bg-amber-400 text-black" : "")}>
              {label}
            </button>
          ))}
        </div>
        <span className="min-w-12 text-right text-sm text-white/70" aria-live="polite">
          {count ? `${count} ✓` : ""}
        </span>
      </div>
      {shotTitle ? <p className="mx-3 rounded-lg bg-amber-400/90 px-3 py-1.5 text-sm font-semibold text-black">Shot: {shotTitle}</p> : null}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video ref={videoEl} className="h-full w-full object-contain" playsInline muted data-testid="camera-preview" />
        {flash ? <div className="absolute inset-0 bg-white/70" /> : null}
        {recording ? (
          <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold">
            ● {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / {Math.floor(maxVideoSeconds / 60)}:{String(maxVideoSeconds % 60).padStart(2, "0")}
          </span>
        ) : null}
        {error ? <p className="absolute inset-x-4 top-4 rounded-lg bg-red-700/90 p-3 text-sm">{error}</p> : null}
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 py-2" aria-label="Snelle tags">
        {QUICK_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
            aria-pressed={tags.includes(t)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", tags.includes(t) ? "bg-amber-400 text-black" : "bg-white/15")}
          >
            {t}
          </button>
        ))}
      </div>
      {mode === "series" ? (
        <div className="flex items-center justify-center gap-3 px-3 pb-1 text-sm">
          <Footprints className="size-4" />
          <label className="flex items-center gap-2">
            Elke
            <input type="number" min={2} max={200} value={seriesMeters} onChange={(e) => setSeriesMeters(Number(e.target.value) || 10)} className="w-16 rounded bg-white/15 px-2 py-1" aria-label="Meters tussen foto's" />
            meter automatisch
          </label>
          <button type="button" onClick={() => setSeriesAuto((v) => !v)} className={cn("rounded-full px-3 py-1 font-semibold", seriesAuto ? "bg-emerald-500 text-black" : "bg-white/15")} aria-pressed={seriesAuto}>
            {seriesAuto ? "Aan" : "Uit"}
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-around p-4 pb-8">
        <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-14 min-w-14 items-center justify-center rounded-full bg-white/15" aria-label="Foto met telefooncamera of uit galerij">
          <Images className="size-6" />
        </button>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFile(e.target.files)} />
        {mode === "video" ? (
          <button
            type="button"
            onClick={recording ? stopVideo : startVideo}
            className="flex size-20 items-center justify-center rounded-full border-4 border-white"
            aria-label={recording ? "Stop video" : "Start video"}
            data-testid="video-button"
          >
            {recording ? <Square className="size-9 fill-red-600 text-red-600" /> : <Circle className="size-14 fill-red-600 text-red-600" />}
          </button>
        ) : (
          <button type="button" onClick={shoot} className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-white/20 active:bg-white/60" aria-label="Maak foto" data-testid="shutter">
            <Camera className="size-9" />
          </button>
        )}
        <span className="min-w-14" />
      </div>
    </div>
  );
}

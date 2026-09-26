"use client";

import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb, type LocalCapture } from "@/lib/offline/db";
import { deleteCapture, saveCapture, saveFinding, saveMeasurement, updateCapture, type FieldIdentity } from "@/lib/offline/field-store";
import type { PhotoResult, VideoResult } from "@/lib/capture-sources/phone-camera";
import type { CaptureDraft, GeoFix } from "@/lib/capture-sources/types";
import type { CaptureSourceKind, FindingCategory, Priority } from "@/lib/domain";
import { AudioRecorderSession, type AudioClip } from "@/lib/media/audio-recorder";
import { makeThumbnail } from "@/lib/media/client";
import type { Bootstrap } from "./use-bootstrap";
import { useGeo } from "./use-geo";

function locFields(fix: GeoFix | null): Pick<CaptureDraft, "lat" | "lon" | "accuracy" | "heading" | "locationSource"> {
  return fix
    ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, heading: fix.heading, locationSource: "gps" }
    : { lat: null, lon: null, accuracy: null, heading: null, locationSource: "none" };
}

/**
 * All capture actions of one running inspection, shared by the phone UI and
 * the smart-glasses UI.
 */
export function useInspectionController(data: Bootstrap, inspectionId: string, source: CaptureSourceKind = "phone-camera") {
  const identity: FieldIdentity = useMemo(() => ({ orgId: data.org.id, userId: data.user.id }), [data.org.id, data.user.id]);
  const inspection = useLiveQuery(() => getLocalDb().inspections.get(inspectionId), [inspectionId]);
  const capturesQ = useLiveQuery(() => getLocalDb().captures.where("inspectionId").equals(inspectionId).reverse().sortBy("capturedAt"), [inspectionId]);
  const answersQ = useLiveQuery(() => getLocalDb().answers.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]);
  const findingsQ = useLiveQuery(() => getLocalDb().findings.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]);
  const measurementsQ = useLiveQuery(() => getLocalDb().measurements.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]);
  const captures = useMemo(() => capturesQ ?? [], [capturesQ]);
  const answers = useMemo(() => answersQ ?? [], [answersQ]);
  const findings = useMemo(() => findingsQ ?? [], [findingsQ]);
  const measurements = useMemo(() => measurementsQ ?? [], [measurementsQ]);
  const template = data.templates.find((t) => t.id === inspection?.templateId) ?? null;
  const geo = useGeo({ trackInspectionId: inspection?.status === "lopend" ? inspectionId : null, intervalSeconds: data.org.field.gpsIntervalSeconds });

  const photos = useMemo(() => captures.filter((c) => c.type === "photo" || c.type === "sketch"), [captures]);

  // Active shot: first required shot without photos, unless the user picked one.
  const [pickedShot, setPickedShot] = useState<string | null>(null);
  const shotCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of captures) if (c.shotId) m.set(c.shotId, (m.get(c.shotId) ?? 0) + 1);
    return m;
  }, [captures]);
  const nextMissingShot = template?.shots.find((s) => s.required && !shotCounts.get(s.id)) ?? null;
  const activeShot = template?.shots.find((s) => s.id === pickedShot) ?? nextMissingShot;
  const moveShot = (
    (dir: 1 | -1) => {
      if (!template?.shots.length) return null;
      const idx = activeShot ? template.shots.findIndex((s) => s.id === activeShot.id) : -1;
      const next = template.shots[(idx + dir + template.shots.length) % template.shots.length]!;
      setPickedShot(next.id);
      return next;
    });

  const addPhoto = (
    async (photo: PhotoResult, meta: { tags: string[]; fix: GeoFix | null; capturedAt: Date; seriesId: string | null }) => {
      const id = crypto.randomUUID();
      const saved = await saveCapture(identity, inspectionId, {
        id,
        type: "photo",
        source,
        capturedAt: meta.capturedAt,
        blob: photo.blob,
        thumb: photo.thumb,
        mime: photo.mime,
        ...locFields(meta.fix),
        shotId: activeShot?.id ?? null,
        tags: meta.tags,
        meta: { width: photo.width, height: photo.height, ...(meta.seriesId ? { seriesId: meta.seriesId } : {}) },
      });
      // After covering the picked shot, fall back to the next missing one.
      if (pickedShot && activeShot?.id === pickedShot) setPickedShot(null);
      return saved;
    });

  const addVideo = (
    async (video: VideoResult, meta: { tags: string[]; track: { lat: number; lon: number; t: number }[]; startedAt: Date; fix: GeoFix | null }) => {
      const id = crypto.randomUUID();
      const start = meta.track[0];
      const fix = start ? { lat: start.lat, lon: start.lon, accuracy: meta.fix?.accuracy ?? null, heading: meta.fix?.heading ?? null, t: start.t } : meta.fix;
      await saveCapture(identity, inspectionId, {
        id,
        type: "video",
        source,
        capturedAt: meta.startedAt,
        blob: video.blob,
        thumb: video.thumb ? (await makeThumbnail(video.thumb)).blob : null,
        mime: video.mime,
        durationMs: video.durationMs,
        keyframes: video.keyframes,
        ...locFields(fix),
        shotId: activeShot?.id ?? null,
        tags: meta.tags,
        meta: { track: meta.track },
      });
      if (video.audio) {
        await saveCapture(identity, inspectionId, {
          id: crypto.randomUUID(),
          type: "audio",
          source,
          capturedAt: meta.startedAt,
          blob: video.audio.blob,
          mime: video.audio.mime,
          durationMs: video.durationMs,
          ...locFields(fix),
          parentCaptureId: id,
          meta: { track: meta.track },
        });
      }
    });

  const addAudio = (
    async (clip: AudioClip, parentCaptureId: string | null = null) => {
      await saveCapture(identity, inspectionId, {
        id: crypto.randomUUID(),
        type: "audio",
        source,
        capturedAt: clip.startedAt,
        blob: clip.blob,
        mime: clip.mime,
        durationMs: clip.durationMs,
        ...locFields(geo.current()),
        parentCaptureId,
        meta: { seriesId: clip.seriesId },
      });
    });

  const addNote = (
    (text: string) =>
      saveCapture(identity, inspectionId, { id: crypto.randomUUID(), type: "note", source, capturedAt: new Date(), ...locFields(geo.current()), textContent: text }));

  const addScan = (
    (text: string, format: string) =>
      saveCapture(identity, inspectionId, {
        id: crypto.randomUUID(),
        type: "scan",
        source,
        capturedAt: new Date(),
        ...locFields(geo.current()),
        textContent: text,
        meta: { scanFormat: format },
      }));

  const addSketch = (
    async (rendered: Blob, drawing: unknown, baseCaptureId: string | null) => {
      const thumb = await makeThumbnail(rendered);
      return saveCapture(identity, inspectionId, {
        id: crypto.randomUUID(),
        type: "sketch",
        source,
        capturedAt: new Date(),
        blob: rendered,
        thumb: thumb.blob,
        mime: "image/jpeg",
        ...locFields(geo.current()),
        parentCaptureId: baseCaptureId,
        meta: { baseCaptureId: baseCaptureId ?? undefined, drawing, width: thumb.width, height: thumb.height },
      });
    });

  const addMeasurement = (
    (m: { kind: string; label: string; value: number; unit: string; photoCaptureId: string | null }) => {
      const fix = geo.current();
      return saveMeasurement(identity, inspectionId, { ...m, lat: fix?.lat ?? null, lon: fix?.lon ?? null, accuracy: fix?.accuracy ?? null });
    });

  const addFinding = (
    (f: { title: string; description: string; category: FindingCategory; priority: Priority; captureIds: string[] }) => {
      const fix = geo.current();
      const photo = f.captureIds.length ? captures.find((c) => c.id === f.captureIds[0]) : undefined;
      return saveFinding(inspectionId, { ...f, lat: photo?.lat ?? fix?.lat ?? null, lon: photo?.lon ?? fix?.lon ?? null });
    });

  const importDrafts = (
    async (drafts: CaptureDraft[]) => {
      for (const d of drafts) await saveCapture(identity, inspectionId, d);
    });

  // Continuous / push-to-talk audio.
  const recorder = useRef<AudioRecorderSession | null>(null);
  const [audioMode, setAudioMode] = useState<null | "continuous" | "ptt" | "voice-note">(null);
  const voiceParent = useRef<string | null>(null);
  const startAudio = (
    async (mode: "continuous" | "ptt" | "voice-note", parentId: string | null = null) => {
      if (recorder.current?.recording) return;
      voiceParent.current = parentId;
      recorder.current = new AudioRecorderSession((clip) => void addAudio(clip, voiceParent.current), 600);
      await recorder.current.start();
      setAudioMode(mode);
    });
  const stopAudio = () => {
    recorder.current?.stop();
    recorder.current = null;
    setAudioMode(null);
  };

  return {
    identity,
    inspection,
    template,
    captures,
    photos,
    answers,
    findings,
    measurements,
    geo,
    activeShot,
    shotCounts,
    setPickedShot,
    moveShot,
    addPhoto,
    addVideo,
    addNote,
    addScan,
    addSketch,
    addMeasurement,
    addFinding,
    importDrafts,
    audioMode,
    startAudio,
    stopAudio,
    updateCapture: (id: string, patch: Parameters<typeof updateCapture>[1]) => updateCapture(id, patch),
    deleteCapture: (c: LocalCapture) => deleteCapture(c.id),
  };
}

export type InspectionController = ReturnType<typeof useInspectionController>;

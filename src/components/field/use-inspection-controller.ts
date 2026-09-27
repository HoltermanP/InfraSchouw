"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb, type LocalCapture } from "@/lib/offline/db";
import { deleteCapture, saveCapture, saveFinding, saveMeasurement, updateCapture, updateLocalInspection, type FieldIdentity } from "@/lib/offline/field-store";
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
  // Only route (tracé) inspections log a GPS track and locate each capture on its own fix.
  const tracksRoute = template?.tracksRoute ?? false;
  const geo = useGeo({ trackInspectionId: tracksRoute && inspection?.status === "lopend" ? inspectionId : null, intervalSeconds: data.org.field.gpsIntervalSeconds });

  // Location inspection without a start location: the first GPS fix becomes the inspection location.
  const placeRequested = useRef(false);
  const needsPlace = Boolean(inspection && template && !tracksRoute && inspection.status === "lopend" && (inspection.lat === null || inspection.lon === null));
  useEffect(() => {
    if (!needsPlace || !geo.fix || placeRequested.current) return;
    placeRequested.current = true;
    void updateLocalInspection(inspectionId, { lat: geo.fix.lat, lon: geo.fix.lon });
  }, [needsPlace, geo.fix, inspectionId]);

  /** Capture location: own GPS fix on a route, otherwise the single inspection location. */
  const place = (fix: GeoFix | null): ReturnType<typeof locFields> =>
    !tracksRoute && inspection && inspection.lat !== null && inspection.lon !== null
      ? { lat: inspection.lat, lon: inspection.lon, accuracy: null, heading: fix?.heading ?? null, locationSource: "inspection" }
      : locFields(fix);

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
        ...place(meta.fix),
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
        ...place(fix),
        shotId: activeShot?.id ?? null,
        tags: meta.tags,
        meta: tracksRoute ? { track: meta.track } : {},
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
          ...place(fix),
          parentCaptureId: id,
          meta: tracksRoute ? { track: meta.track } : {},
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
        ...place(geo.current()),
        parentCaptureId,
        meta: { seriesId: clip.seriesId },
      });
    });

  const addNote = (
    (text: string) =>
      saveCapture(identity, inspectionId, { id: crypto.randomUUID(), type: "note", source, capturedAt: new Date(), ...place(geo.current()), textContent: text }));

  const addScan = (
    (text: string, format: string) =>
      saveCapture(identity, inspectionId, {
        id: crypto.randomUUID(),
        type: "scan",
        source,
        capturedAt: new Date(),
        ...place(geo.current()),
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
        ...place(geo.current()),
        parentCaptureId: baseCaptureId,
        meta: { baseCaptureId: baseCaptureId ?? undefined, drawing, width: thumb.width, height: thumb.height },
      });
    });

  const addMeasurement = (
    (m: { kind: string; label: string; value: number; unit: string; photoCaptureId: string | null }) => {
      const loc = place(geo.current());
      return saveMeasurement(identity, inspectionId, { ...m, lat: loc.lat, lon: loc.lon, accuracy: loc.accuracy });
    });

  const addFinding = (
    (f: { title: string; description: string; category: FindingCategory; priority: Priority; captureIds: string[] }) => {
      const loc = place(geo.current());
      const photo = tracksRoute && f.captureIds.length ? captures.find((c) => c.id === f.captureIds[0]) : undefined;
      return saveFinding(inspectionId, { ...f, lat: photo?.lat ?? loc.lat, lon: photo?.lon ?? loc.lon });
    });

  const importDrafts = (
    async (drafts: CaptureDraft[]) => {
      for (const d of drafts) {
        // Location inspection: imported files also land on the inspection location.
        const loc = tracksRoute || d.locationSource === "manual" ? null : place(d.lat !== null && d.lon !== null ? { lat: d.lat, lon: d.lon, accuracy: d.accuracy, heading: d.heading, t: 0 } : null);
        await saveCapture(identity, inspectionId, loc ? { ...d, ...loc } : d);
      }
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
    tracksRoute,
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

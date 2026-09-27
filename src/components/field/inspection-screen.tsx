"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Video,
  Mic,
  StickyNote,
  Ruler,
  AlertTriangle,
  ScanLine,
  MoreHorizontal,
  Images,
  PenLine,
  Upload,
  Flag,
  Ear,
  EarOff,
  Navigation,
  Square,
  ChevronRight,
} from "lucide-react";
import { PhoneCameraSource } from "@/lib/capture-sources/phone-camera";
import { GlassesBrowserSource, isGlassesDevice } from "@/lib/capture-sources/glasses-browser";
import { CAPTURE_TYPE_LABELS, PRIORITY_COLORS, FINDING_CATEGORY_LABELS } from "@/lib/domain";
import type { VoiceCommand } from "@/lib/voice/commands";
import { VOICE_HELP } from "@/lib/voice/commands";
import { fmtTime } from "@/lib/format";
import { vibrate } from "@/lib/media/client";
import { cn } from "@/lib/utils";
import { AnnotationEditor } from "@/components/annotation/annotation-editor";
import { LazyMap } from "@/components/map/lazy-map";
import type { LocalCapture } from "@/lib/offline/db";
import type { Bootstrap } from "./use-bootstrap";
import type { FieldRoute } from "./nav";
import type { SyncState } from "./field-app";
import { CameraOverlay, type CameraHandle, type CameraMode } from "./camera-overlay";
import { CaptureDetailSheet, FindingSheet, MeasurementSheet, NoteSheet } from "./field-sheets";
import { ChecklistPanel, ShotlistPanel } from "./panels";
import { ScanOverlay } from "./scan-overlay";
import { ImportSheet } from "./import-sheet";
import { CaptureThumb, useCaptureUrl } from "./media";
import { useHandsfree, speechRecognitionSupported } from "./use-handsfree";
import { requestCompassPermission } from "./use-geo";
import { useInspectionController } from "./use-inspection-controller";
import { inspectionSite } from "@/lib/geo/site";

type Overlay =
  | { kind: "camera"; mode: CameraMode }
  | { kind: "note" }
  | { kind: "measurement" }
  | { kind: "finding"; priority?: "hoog" | "midden" | "laag"; text?: string }
  | { kind: "scan" }
  | { kind: "sketch"; baseCaptureId: string | null }
  | { kind: "import" }
  | { kind: "detail"; captureId: string }
  | { kind: "more" }
  | { kind: "help" }
  | null;

type Tab = "vastleggen" | "shotlist" | "checklist" | "bevindingen" | "kaart";

function BigButton({ icon: Icon, label, onClick, active, testId, ...rest }: { icon: typeof Camera; label: string; onClick?: () => void; active?: boolean; testId?: string } & Omit<React.ComponentProps<"button">, "onClick">) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn("field-btn active:scale-95", active ? "bg-red-600 text-white" : "bg-white/10 text-white")}
      {...rest}
    >
      <Icon className="size-7" aria-hidden />
      <span className="text-xs">{label}</span>
    </button>
  );
}

function SketchBase({ captureId, captures, onSave, onCancel }: { captureId: string | null; captures: LocalCapture[]; onSave: (b: Blob, d: unknown) => Promise<void>; onCancel: () => void }) {
  const base = captureId ? captures.find((c) => c.id === captureId) ?? null : null;
  const url = useCaptureUrl(base, "orig");
  if (captureId && !url) return null;
  return (
    <div className="fixed inset-0 z-50">
      <AnnotationEditor imageSrc={base ? url : null} onCancel={onCancel} onSave={({ rendered, drawing }) => onSave(rendered, drawing)} saveLabel="Schets opslaan" />
    </div>
  );
}

export function InspectionScreen({ data, inspectionId, go, sync }: { data: Bootstrap; inspectionId: string; go: (r: FieldRoute) => void; sync: SyncState }) {
  const ctl = useInspectionController(data, inspectionId, isGlassesDevice() ? "glasses-browser" : "phone-camera");
  const { inspection, template, captures, photos, geo, activeShot } = ctl;
  const site = inspection ? inspectionSite(inspection, captures) : null;
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tab, setTab] = useState<Tab>("vastleggen");
  const cameraHandle = useRef<CameraHandle | null>(null);
  const pendingCameraAction = useRef<null | "photo" | "start-video">(null);
  const source = useMemo(() => (isGlassesDevice() ? new GlassesBrowserSource() : new PhoneCameraSource()), []);
  const warnAt = data.org.field.accuracyWarningMeters;

  const confirmRef = useRef<(text: string) => void>(() => undefined);
  const handsfree = useHandsfree((cmd: VoiceCommand) => {
    const say = (text: string) => confirmRef.current(text);
    switch (cmd.type) {
      case "photo":
        if (overlay?.kind === "camera") cameraHandle.current?.takePhoto();
        else {
          pendingCameraAction.current = "photo";
          setOverlay({ kind: "camera", mode: "photo" });
        }
        say("📷 Foto");
        break;
      case "start-video":
        if (overlay?.kind === "camera" && overlay.mode === "video") cameraHandle.current?.startVideo();
        else {
          pendingCameraAction.current = "start-video";
          setOverlay({ kind: "camera", mode: "video" });
        }
        say("🎥 Video gestart");
        break;
      case "stop-video":
        cameraHandle.current?.stopVideo();
        say("⏹ Video gestopt");
        break;
      case "start-audio":
        void ctl.startAudio("continuous");
        say("🎙 Opname gestart");
        break;
      case "stop-audio":
        ctl.stopAudio();
        say("⏹ Opname gestopt");
        break;
      case "note":
        if (cmd.text) void ctl.addNote(cmd.text).then(() => say(`📝 Notitie: ${cmd.text}`));
        break;
      case "finding":
        void ctl
          .addFinding({ title: cmd.text.slice(0, 120) || "Bevinding", description: cmd.text, category: "kwaliteit", priority: cmd.priority, captureIds: photos[0] ? [photos[0].id] : [] })
          .then(() => say(`⚠ Bevinding ${cmd.priority}: ${cmd.text}`));
        break;
      case "measurement":
        void ctl
          .addMeasurement({ kind: cmd.kind, label: cmd.label, value: cmd.value, unit: cmd.unit, photoCaptureId: photos[0]?.id ?? null })
          .then(() => say(`📏 ${cmd.label}: ${cmd.value} ${cmd.unit}`));
        break;
      case "next-shot": {
        const s = ctl.moveShot(1);
        say(s ? `➡ ${s.title}` : "Geen shotlist");
        break;
      }
      case "previous-shot": {
        const s = ctl.moveShot(-1);
        say(s ? `⬅ ${s.title}` : "Geen shotlist");
        break;
      }
      case "scan":
        setOverlay({ kind: "scan" });
        say("Scanner geopend");
        break;
      case "finish":
        go({ view: "inspection", id: inspectionId, step: "afronden" });
        break;
      case "help":
        setOverlay({ kind: "help" });
        break;
      default:
        say(`Niet herkend: “${cmd.type === "unknown" ? cmd.text : ""}”`);
    }
  });

  useEffect(() => {
    confirmRef.current = handsfree.confirm;
  });

  // Voice command issued while the camera was closed: act once it is ready.
  useEffect(() => {
    if (overlay?.kind !== "camera" || !pendingCameraAction.current) return;
    const action = pendingCameraAction.current;
    pendingCameraAction.current = null;
    const t = setTimeout(() => (action === "photo" ? cameraHandle.current?.takePhoto() : cameraHandle.current?.startVideo()), 1500);
    return () => clearTimeout(t);
  }, [overlay]);

  if (inspection === undefined) return <p className="p-6 text-center text-white/70">Laden…</p>;
  if (!inspection || !template) {
    return (
      <div className="p-6 text-center">
        <p>Deze schouw staat niet op dit apparaat.</p>
        <a href={`/schouwen/${inspectionId}`} className="text-amber-300 underline">
          Open in de backend
        </a>
      </div>
    );
  }
  if (inspection.status !== "lopend") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <Flag className="size-10 text-emerald-400" />
        <p className="text-lg font-semibold">Deze schouw is afgerond.</p>
        <p className="text-sm text-white/70">{sync.pending ? `${sync.pending} item(s) wachten nog op synchronisatie.` : "Alles is gesynchroniseerd; het verslag wordt voorbereid."}</p>
        <a href={`/schouwen/${inspectionId}/verslag`} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">
          Naar het verslag
        </a>
        <button type="button" onClick={() => go({ view: "home" })} className="text-sm text-white/70 underline">
          Terug naar overzicht
        </button>
      </div>
    );
  }

  const fix = geo.fix;
  const accOk = fix?.accuracy !== null && fix?.accuracy !== undefined && fix.accuracy <= warnAt;
  const missingShots = template.shots.filter((s) => s.required && !ctl.shotCounts.get(s.id)).length;

  return (
    <div className="flex flex-1 flex-col pb-44">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold" data-testid="inspection-title">
              {inspection.title}
            </h1>
            <p className="text-xs text-white/60">{template.name}</p>
          </div>
          <button type="button" onClick={() => go({ view: "inspection", id: inspectionId, step: "afronden" })} className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-sm font-semibold" data-testid="goto-finish">
            <Flag className="size-4" /> Afronden
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn("flex items-center gap-1 rounded-full px-2 py-1", !fix ? "bg-neutral-700" : accOk ? "bg-emerald-700" : "bg-amber-500 text-black")}
            data-testid="gps-status"
            onClick={() => void requestCompassPermission()}
          >
            <Navigation className="size-3.5" />
            {geo.error ?? (fix ? `GPS ±${Math.round(fix.accuracy ?? 0)} m${accOk ? "" : " — onnauwkeurig!"}` : "GPS zoeken…")}
          </span>
          {geo.heading !== null ? <span className="rounded-full bg-white/10 px-2 py-1">Richting {geo.heading}°</span> : null}
          <span className="rounded-full bg-white/10 px-2 py-1">{captures.length} captures</span>
          {speechRecognitionSupported() ? (
            <button
              type="button"
              onClick={() => (handsfree.active ? handsfree.stop() : handsfree.start())}
              className={cn("flex items-center gap-1 rounded-full px-2 py-1", handsfree.active ? "bg-sky-500 text-black" : "bg-white/10")}
              aria-pressed={handsfree.active}
              data-testid="handsfree-toggle"
            >
              {handsfree.active ? <Ear className="size-3.5" /> : <EarOff className="size-3.5" />} Handsfree
            </button>
          ) : null}
        </div>
        {handsfree.error ? <p className="mt-1 text-xs text-amber-300">{handsfree.error}</p> : null}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-2" aria-label="Onderdelen">
        {(
          [
            ["vastleggen", "Vastgelegd"],
            ["shotlist", `Shotlist${missingShots ? ` (${missingShots})` : ""}`],
            ["checklist", "Checklist"],
            ["bevindingen", `Bevindingen (${ctl.findings.length})`],
            ["kaart", "Kaart"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={cn("shrink-0 border-b-2 px-3 py-3 text-sm font-semibold", tab === key ? "border-amber-400" : "border-transparent text-white/60")}>
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 p-4">
        {activeShot && tab !== "shotlist" ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-400/15 p-3 text-sm">
            <Camera className="size-4 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">
              <span className="text-xs text-amber-300">Volgende shot</span>
              <span className="block truncate font-semibold">{activeShot.title}</span>
            </span>
            <button type="button" onClick={() => ctl.moveShot(1)} className="rounded-lg bg-white/10 p-2" aria-label="Volgende shot">
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}

        {tab === "vastleggen" ? (
          captures.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/20 p-6 text-center text-white/60">Nog niets vastgelegd. Gebruik de knoppen onderin.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="capture-grid">
              {captures.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setOverlay({ kind: "detail", captureId: c.id })} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-white/5" data-testid={`capture-${c.type}`}>
                    <CaptureThumb capture={c} className="size-full" />
                    <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 py-0.5 text-[10px]">
                      <span>{CAPTURE_TYPE_LABELS[c.type]}</span>
                      <span>{fmtTime(c.capturedAt)}</span>
                    </span>
                    <span
                      className={cn(
                        "absolute top-1 right-1 size-2.5 rounded-full",
                        c.status === "pending" ? "bg-amber-400" : c.status === "uploading" ? "animate-pulse bg-sky-400" : c.status === "error" ? "bg-red-500" : "bg-emerald-400",
                      )}
                      title={c.status}
                    />
                    {c.locationSource === "none" ? <span className="absolute top-1 left-1 rounded bg-red-600 px-1 text-[9px]">geen GPS</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === "shotlist" ? (
          <ShotlistPanel
            template={template}
            captures={captures}
            activeShotId={activeShot?.id ?? null}
            onPick={(id) => {
              ctl.setPickedShot(id);
              setOverlay({ kind: "camera", mode: "photo" });
            }}
          />
        ) : tab === "checklist" ? (
          <ChecklistPanel template={template} answers={ctl.answers} inspectionId={inspectionId} photos={photos} />
        ) : tab === "bevindingen" ? (
          <ul className="flex flex-col gap-2">
            {ctl.findings.length === 0 ? <p className="text-sm text-white/60">Nog geen bevindingen.</p> : null}
            {ctl.findings.map((f) => (
              <li key={f.id} className="flex gap-3 rounded-xl bg-white/5 p-3">
                <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[f.priority as "hoog"] }} />
                <div className="min-w-0">
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-xs text-white/60">
                    {FINDING_CATEGORY_LABELS[f.category as "kwaliteit"]} · {f.priority} · {f.captureIds.length} foto(&apos;s)
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-[55vh]">
            <LazyMap
              className="h-full"
              showUserLocation
              captures={ctl.tracksRoute ? captures.filter((c) => c.lat !== null && c.lon !== null).map((c) => ({ id: c.id, type: c.type, lat: c.lat!, lon: c.lon!, seq: null, heading: c.heading })) : []}
              findings={ctl.tracksRoute ? ctl.findings.filter((f) => f.lat !== null && f.lon !== null).map((f) => ({ id: f.id, lat: f.lat!, lon: f.lon!, priority: f.priority as "hoog", title: f.title })) : []}
              points={!ctl.tracksRoute && site ? [{ id: "schouwlocatie", ...site, label: "Schouwlocatie", kind: "inspection" }] : []}
              onSelect={(sel) => sel?.kind === "capture" && setOverlay({ kind: "detail", captureId: sel.id })}
            />
          </div>
        )}
      </div>

      {/* Glove-friendly action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-neutral-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {ctl.audioMode ? (
          <button type="button" onClick={ctl.stopAudio} className="mb-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold" data-testid="stop-audio">
            <Square className="size-5" /> Opname stoppen ({ctl.audioMode === "continuous" ? "doorlopend" : ctl.audioMode === "voice-note" ? "spraaknotitie" : "push-to-talk"})
          </button>
        ) : null}
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
          <BigButton icon={Camera} label="Foto" onClick={() => setOverlay({ kind: "camera", mode: "photo" })} testId="btn-photo" />
          <BigButton icon={Video} label="Video" onClick={() => setOverlay({ kind: "camera", mode: "video" })} testId="btn-video" />
          <BigButton
            icon={Mic}
            label={ctl.audioMode ? "Opname…" : "Spraak"}
            active={Boolean(ctl.audioMode)}
            testId="btn-audio"
            onClick={() => (ctl.audioMode ? ctl.stopAudio() : void ctl.startAudio("continuous"))}
            onPointerDown={(e) => {
              // Long press = push-to-talk.
              const target = e.currentTarget;
              const timer = setTimeout(() => {
                target.dataset.ptt = "1";
                vibrate(40);
                void ctl.startAudio("ptt");
              }, 450);
              const up = () => {
                clearTimeout(timer);
                if (target.dataset.ptt) {
                  delete target.dataset.ptt;
                  ctl.stopAudio();
                }
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointerup", up);
            }}
          />
          <BigButton icon={StickyNote} label="Notitie" onClick={() => setOverlay({ kind: "note" })} testId="btn-note" />
          <BigButton icon={Ruler} label="Meting" onClick={() => setOverlay({ kind: "measurement" })} testId="btn-measurement" />
          <BigButton icon={AlertTriangle} label="Bevinding" onClick={() => setOverlay({ kind: "finding" })} testId="btn-finding" />
          <BigButton icon={ScanLine} label="Scan" onClick={() => setOverlay({ kind: "scan" })} testId="btn-scan" />
          <BigButton icon={MoreHorizontal} label="Meer" onClick={() => setOverlay({ kind: "more" })} testId="btn-more" />
        </div>
      </div>

      {handsfree.confirmation ? (
        <div className="pointer-events-none fixed inset-x-4 top-1/3 z-[60] rounded-3xl bg-sky-500 p-6 text-center text-2xl font-bold text-black shadow-2xl" role="status" aria-live="assertive">
          {handsfree.confirmation}
        </div>
      ) : null}
      {handsfree.active && handsfree.lastHeard ? (
        <p className="fixed right-2 bottom-40 left-2 z-30 truncate rounded-full bg-sky-900/80 px-3 py-1 text-center text-xs">Gehoord: “{handsfree.lastHeard}”</p>
      ) : null}

      {overlay?.kind === "camera" ? (
        <CameraOverlay
          mode={overlay.mode}
          source={source}
          currentFix={geo.current}
          shotTitle={activeShot?.title ?? null}
          maxVideoSeconds={data.org.field.maxVideoSeconds}
          keyframeSeconds={data.org.field.keyframeIntervalSeconds}
          onPhoto={async (p, meta) => void (await ctl.addPhoto(p, meta))}
          onVideo={(v, meta) => ctl.addVideo(v, meta)}
          onClose={() => setOverlay(null)}
          handleRef={cameraHandle}
        />
      ) : null}
      {overlay?.kind === "note" ? (
        <NoteSheet
          onClose={() => setOverlay(null)}
          onSave={async (text) => {
            await ctl.addNote(text);
            setOverlay(null);
          }}
        />
      ) : null}
      {overlay?.kind === "measurement" ? (
        <MeasurementSheet
          photos={photos}
          onClose={() => setOverlay(null)}
          onSave={async (m) => {
            await ctl.addMeasurement(m);
            setOverlay(null);
          }}
        />
      ) : null}
      {overlay?.kind === "finding" ? (
        <FindingSheet
          photos={photos}
          initialPriority={overlay.priority}
          initialText={overlay.text}
          onClose={() => setOverlay(null)}
          onSave={async (f) => {
            await ctl.addFinding(f);
            setOverlay(null);
          }}
        />
      ) : null}
      {overlay?.kind === "scan" ? (
        <ScanOverlay
          onClose={() => setOverlay(null)}
          onResult={async (r) => {
            await ctl.addScan(r.text, r.format);
            vibrate(60);
            setOverlay(null);
          }}
        />
      ) : null}
      {overlay?.kind === "sketch" ? (
        <SketchBase
          captureId={overlay.baseCaptureId}
          captures={captures}
          onCancel={() => setOverlay(null)}
          onSave={async (blob, drawing) => {
            await ctl.addSketch(blob, drawing, overlay.baseCaptureId);
            setOverlay(null);
          }}
        />
      ) : null}
      {overlay?.kind === "import" ? <ImportSheet inspectionId={inspectionId} tracksRoute={ctl.tracksRoute} onImport={ctl.importDrafts} onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === "detail"
        ? (() => {
            const c = captures.find((x) => x.id === overlay.captureId);
            if (!c) return null;
            return (
              <CaptureDetailSheet
                capture={c}
                shots={template.shots}
                accuracyWarning={warnAt}
                onClose={() => setOverlay(null)}
                onUpdate={(patch) => ctl.updateCapture(c.id, patch)}
                onDelete={async () => {
                  await ctl.deleteCapture(c);
                  setOverlay(null);
                }}
                recordingVoice={ctl.audioMode === "voice-note"}
                onVoiceNote={() => (ctl.audioMode === "voice-note" ? ctl.stopAudio() : void ctl.startAudio("voice-note", c.id))}
                onAnnotate={() => setOverlay({ kind: "sketch", baseCaptureId: c.id })}
              />
            );
          })()
        : null}
      {overlay?.kind === "more" ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setOverlay(null)}>
          <div className="w-full rounded-t-3xl bg-neutral-900 p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2">
              <BigButton icon={Images} label="Fotoreeks" onClick={() => setOverlay({ kind: "camera", mode: "series" })} testId="btn-series" />
              <BigButton icon={PenLine} label="Schets" onClick={() => setOverlay({ kind: "sketch", baseCaptureId: null })} testId="btn-sketch" />
              <BigButton icon={Upload} label="Importeren" onClick={() => setOverlay({ kind: "import" })} testId="btn-import" />
              <BigButton icon={handsfree.active ? EarOff : Ear} label={handsfree.active ? "Handsfree uit" : "Handsfree aan"} onClick={() => (handsfree.active ? handsfree.stop() : handsfree.start())} />
              <BigButton icon={Mic} label="Commando's" onClick={() => setOverlay({ kind: "help" })} />
              <BigButton icon={Flag} label="Afronden" onClick={() => go({ view: "inspection", id: inspectionId, step: "afronden" })} />
            </div>
          </div>
        </div>
      ) : null}
      {overlay?.kind === "help" ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950 p-6" onClick={() => setOverlay(null)}>
          <h2 className="mb-4 text-2xl font-bold">Spraakcommando&apos;s</h2>
          <ul className="flex flex-col gap-3">
            {VOICE_HELP.map((h) => (
              <li key={h.say}>
                <p className="text-xl font-bold text-sky-300">“{h.say}”</p>
                <p className="text-white/70">{h.does}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-white/50">Tik om te sluiten</p>
        </div>
      ) : null}
    </div>
  );
}

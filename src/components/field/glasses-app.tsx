"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/offline/db";
import { createLocalInspection } from "@/lib/offline/field-store";
import { GlassesBrowserSource } from "@/lib/capture-sources/glasses-browser";
import { parseGlassesHomeCommand, parseVoiceCommand, VOICE_HELP } from "@/lib/voice/commands";
import { reverseGeocode } from "@/lib/geo/pdok";
import { fetchWeather } from "@/lib/geo/weather";
import { vibrate } from "@/lib/media/client";
import { useBootstrap, type Bootstrap } from "./use-bootstrap";
import { useSync } from "./use-sync";
import { useInspectionController } from "./use-inspection-controller";
import { speechRecognitionSupported } from "./use-handsfree";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

/** Always-on speech recognition for the glasses UI (no touch needed). */
function useContinuousSpeech(onText: (text: string) => void) {
  const handler = useRef(onText);
  useEffect(() => {
    handler.current = onText;
  });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const w = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Spraakherkenning niet beschikbaar in deze browser.");
      return;
    }
    let alive = true;
    const rec = new Ctor();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) handler.current(r[0]!.transcript.trim());
      }
    };
    rec.onerror = (e) => e.error === "not-allowed" && setError("Geen toestemming voor de microfoon.");
    rec.onend = () => {
      if (alive) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Spraakherkenning kon niet starten.");
    }
    return () => {
      alive = false;
      rec.stop();
    };
  }, []);
  return { listening, error };
}

function Banner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="fixed inset-x-6 top-1/3 z-50 rounded-3xl bg-yellow-300 p-8 text-center text-4xl font-black text-black" role="status" aria-live="assertive">
      {text}
    </div>
  );
}

function GlassesInspection({ data, inspectionId, onExit, heard }: { data: Bootstrap; inspectionId: string; onExit: () => void; heard: (fn: (text: string) => void) => void }) {
  const ctl = useInspectionController(data, inspectionId, "glasses-browser");
  const video = useRef<HTMLVideoElement>(null);
  const source = useMemo(() => new GlassesBrowserSource(), []);
  const [banner, setBanner] = useState<string | null>(null);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const trackRef = useRef<{ lat: number; lon: number; t: number }[]>([]);
  const videoStart = useRef<Date | null>(null);

  const flash = (text: string) => {
    setBanner(text);
    vibrate([60, 40, 60]);
    setTimeout(() => setBanner(null), 1800);
  };

  useEffect(() => {
    void source.start(video.current!, true).catch(() => flash("Camera niet beschikbaar"));
    return () => source.stop();
  }, [source]);

  useEffect(() => {
    if (!recordingVideo) return;
    const t = setInterval(() => {
      const f = ctl.geo.current();
      if (f) trackRef.current.push({ lat: f.lat, lon: f.lon, t: Date.now() });
    }, 1000);
    return () => clearInterval(t);
  }, [recordingVideo, ctl.geo]);

  useEffect(() => {
    heard(async (text) => {
      const cmd = parseVoiceCommand(text);
      switch (cmd.type) {
        case "photo": {
          const photo = await source.takePhoto();
          await ctl.addPhoto(photo, { tags: [], fix: ctl.geo.current(), capturedAt: new Date(), seriesId: null });
          flash("📷 FOTO");
          break;
        }
        case "start-video":
          trackRef.current = [];
          videoStart.current = new Date();
          await source.startVideo();
          setRecordingVideo(true);
          flash("🎥 VIDEO GESTART");
          break;
        case "stop-video": {
          if (!recordingVideo) break;
          setRecordingVideo(false);
          const v = await source.stopVideo(data.org.field.keyframeIntervalSeconds);
          await ctl.addVideo(v, { tags: [], track: trackRef.current, startedAt: videoStart.current ?? new Date(), fix: ctl.geo.current() });
          flash("⏹ VIDEO OPGESLAGEN");
          break;
        }
        case "start-audio":
          await ctl.startAudio("continuous");
          flash("🎙 OPNAME");
          break;
        case "stop-audio":
          ctl.stopAudio();
          flash("⏹ OPNAME GESTOPT");
          break;
        case "note":
          await ctl.addNote(cmd.text);
          flash("📝 NOTITIE");
          break;
        case "finding":
          await ctl.addFinding({ title: cmd.text.slice(0, 120) || "Bevinding", description: cmd.text, category: "kwaliteit", priority: cmd.priority, captureIds: ctl.photos[0] ? [ctl.photos[0].id] : [] });
          flash(`⚠ BEVINDING ${cmd.priority.toUpperCase()}`);
          break;
        case "measurement":
          await ctl.addMeasurement({ kind: cmd.kind, label: cmd.label, value: cmd.value, unit: cmd.unit, photoCaptureId: ctl.photos[0]?.id ?? null });
          flash(`📏 ${cmd.value} ${cmd.unit}`);
          break;
        case "next-shot":
        case "previous-shot": {
          const s = ctl.moveShot(cmd.type === "next-shot" ? 1 : -1);
          flash(s ? s.title : "GEEN SHOTLIST");
          break;
        }
        case "help":
          setShowHelp((v) => !v);
          break;
        case "finish":
          flash("AFRONDEN OP TELEFOON");
          break;
        default:
          if (/^(terug|stop schouw|sluiten)$/i.test(text.trim())) onExit();
          else flash(`? ${text}`);
      }
    });
  });

  const shotsLeft = ctl.template?.shots.filter((s) => s.required && !ctl.shotCounts.get(s.id)).length ?? 0;
  const fix = ctl.geo.fix;
  return (
    <div className="relative flex min-h-dvh flex-col bg-black text-yellow-300">
      <video ref={video} className="absolute inset-0 h-full w-full object-cover opacity-60" muted playsInline />
      <div className="relative z-10 flex flex-1 flex-col justify-between p-6">
        <div>
          <p className="text-2xl font-bold text-white" data-testid="glasses-title">
            {ctl.inspection?.title}
          </p>
          <p className="text-xl">
            GPS {fix ? `±${Math.round(fix.accuracy ?? 0)} m` : "zoeken…"} · {ctl.captures.length} opnames
            {recordingVideo ? " · ● VIDEO" : ""}
            {ctl.audioMode ? " · ● SPRAAK" : ""}
          </p>
        </div>
        {ctl.activeShot ? (
          <div className="rounded-2xl bg-black/80 p-4">
            <p className="text-lg">Volgende shot ({shotsLeft} verplicht open)</p>
            <p className="text-3xl font-black">{ctl.activeShot.title}</p>
          </div>
        ) : null}
        <p className="rounded-2xl bg-black/80 p-3 text-xl">
          Zeg: <b>foto</b> · <b>start video</b> · <b>notitie …</b> · <b>bevinding hoog …</b> · <b>volgende shot</b> · <b>help</b> · <b>terug</b>
        </p>
      </div>
      {showHelp ? (
        <div className="absolute inset-0 z-40 overflow-auto bg-black p-6">
          {VOICE_HELP.map((h) => (
            <p key={h.say} className="mb-3 text-2xl">
              <b>“{h.say}”</b> — {h.does}
            </p>
          ))}
        </div>
      ) : null}
      <Banner text={banner} />
    </div>
  );
}

export function GlassesApp() {
  const { data } = useBootstrap();
  const sync = useSync();
  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const inspections = useLiveQuery(() => (data ? getLocalDb().inspections.where("status").equals("lopend").reverse().sortBy("updatedAt") : []), [data?.user.id]) ?? [];
  const inspectionHandler = useRef<((text: string) => void) | null>(null);
  const flash = (text: string) => {
    setBanner(text);
    vibrate([60, 40, 60]);
    setTimeout(() => setBanner(null), 2200);
  };

  const speech = useContinuousSpeech(async (text) => {
    setLastHeard(text);
    if (openId && inspectionHandler.current) {
      inspectionHandler.current(text);
      return;
    }
    if (!data) return;
    const cmd = parseGlassesHomeCommand(text, data.templates);
    if (cmd.type === "open") {
      const insp = inspections[cmd.index];
      if (insp) setOpenId(insp.id);
      else flash(`Schouw ${cmd.index + 1} bestaat niet`);
    } else if (cmd.type === "new") {
      const pos = await new Promise<GeolocationPosition | null>((r) => navigator.geolocation.getCurrentPosition(r, () => r(null), { enableHighAccuracy: true, timeout: 8000 }));
      const lat = pos?.coords.latitude ?? null;
      const lon = pos?.coords.longitude ?? null;
      const [addr, weather] = lat !== null && lon !== null && navigator.onLine ? await Promise.all([reverseGeocode(lat, lon), fetchWeather(lat, lon)]) : [null, null];
      const tpl = data.templates.find((t) => t.id === cmd.templateId)!;
      const local = await createLocalInspection(
        { orgId: data.org.id, userId: data.user.id },
        {
          templateId: tpl.id,
          projectId: null,
          stationId: null,
          title: `${tpl.name} – ${addr?.address.split(",")[0] ?? "locatie"} – ${new Date().toLocaleDateString("nl-NL")}`,
          weather,
          address: addr?.address ?? null,
          lat,
          lon,
          participants: [],
        },
      );
      flash(`GESTART: ${tpl.name}`);
      setOpenId(local.id);
    } else if (cmd.type === "help") {
      flash("Zeg “nieuwe schouw tracé” of “open schouw 1”");
    }
  });

  if (!data) return <div className="flex min-h-dvh items-center justify-center bg-black text-3xl text-yellow-300">Laden…</div>;
  if (openId) {
    return (
      <>
        <GlassesInspection data={data} inspectionId={openId} onExit={() => setOpenId(null)} heard={(fn) => (inspectionHandler.current = fn)} />
        {lastHeard ? <p className="fixed right-4 bottom-4 left-4 z-50 truncate text-center text-lg text-white/70">“{lastHeard}”</p> : null}
      </>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col gap-6 bg-black p-8 text-yellow-300">
      <h1 className="text-4xl font-black">InfraSchouw — bril</h1>
      <p className="text-2xl">
        {speech.error ?? (speech.listening ? "Luistert… " : "")}
        {!speechRecognitionSupported() ? "Deze browser ondersteunt geen spraakherkenning." : ""}
      </p>
      <p className="text-xl text-white">
        Sync: {sync.online ? "online" : "offline"} · {sync.pending} wachtend
      </p>
      <section>
        <h2 className="mb-2 text-3xl font-bold">Lopende schouwen</h2>
        {inspections.length === 0 ? <p className="text-2xl text-white">Geen. Zeg “nieuwe schouw tracé” (of een ander schouwtype).</p> : null}
        <ol className="flex flex-col gap-3">
          {inspections.map((i, idx) => (
            <li key={i.id} className="text-3xl">
              <b>Schouw {idx + 1}</b>: {i.title}
            </li>
          ))}
        </ol>
      </section>
      <section className="text-2xl text-white">
        <p>Zeg “open schouw 1” of “nieuwe schouw …” met het type:</p>
        <p className="mt-2 text-xl text-white/70">{data.templates.map((t) => t.name).join(" · ")}</p>
      </section>
      {lastHeard ? <p className="text-xl text-white/70">Gehoord: “{lastHeard}”</p> : null}
      <Banner text={banner} />
    </div>
  );
}

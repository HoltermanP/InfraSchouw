"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, Mic, Video, Radio, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction } from "@/hooks/use-action";
import { createDevice } from "@/app/(app)/instellingen/apparaten/actions";

type LogEntry = { at: string; request: string; status: number; body: unknown };

async function makeTestPhoto(label: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1200;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 1600, 1200);
  grad.addColorStop(0, "#3b82f6");
  grad.addColorStop(1, "#0f172a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1600, 1200);
  g.fillStyle = "#facc15";
  g.fillRect(0, 980, 1600, 220);
  g.fillStyle = "#fff";
  g.font = "bold 72px system-ui";
  g.fillText("Demo – brilfoto (simulator)", 80, 200);
  g.font = "48px system-ui";
  g.fillText(label, 80, 300);
  g.fillStyle = "#0f172a";
  g.font = "bold 56px system-ui";
  g.fillText("InfraSchouw smart-glasses ingest", 80, 1110);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
}

function makeTone(seconds = 2): Blob {
  const rate = 16000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 8000, true);
  return new Blob([buf], { type: "audio/wav" });
}

async function makeTestVideo(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const g = c.getContext("2d")!;
  const stream = c.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start(200);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      g.fillStyle = `hsl(${(t * 90) % 360} 60% 40%)`;
      g.fillRect(0, 0, 640, 360);
      g.fillStyle = "#fff";
      g.font = "bold 36px system-ui";
      g.fillText(`Demo – brilvideo ${t.toFixed(1)} s`, 40, 190);
      if (t < 2.5) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  return new Blob(chunks, { type: "video/webm" });
}

export function GlassesSimulator({ userId }: { userId: string }) {
  const { run, pending } = useAction();
  const [token, setToken] = useState("");
  const [withGps, setWithGps] = useState(false);
  const [lat, setLat] = useState("52.5270");
  const [lon, setLon] = useState("6.0450");
  const [status, setStatus] = useState<{ target: string; activeInspection: { id: string; title: string } | null } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(sessionStorage.getItem("infraschouw-sim-token") ?? "");
    } catch {
      /* no storage */
    }
  }, []);
  useEffect(() => {
    try {
      if (token) sessionStorage.setItem("infraschouw-sim-token", token);
    } catch {
      /* no storage */
    }
  }, [token]);

  const auth = { Authorization: `Bearer ${token}` };
  const record = async (request: string, res: Response) => {
    const body = await res.json().catch(() => null);
    setLog((l) => [{ at: new Date().toLocaleTimeString("nl-NL"), request, status: res.status, body }, ...l]);
    return body;
  };

  async function refreshStatus() {
    const res = await fetch("/api/ingest/glasses", { headers: auth });
    const body = await record("GET /api/ingest/glasses", res);
    if (res.ok) setStatus(body);
  }

  async function sendMultipart(blob: Blob, name: string, type: "photo" | "audio") {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", blob, name);
      fd.set("type", type);
      fd.set("capturedAt", new Date().toISOString());
      fd.set("deviceId", "simulator");
      if (withGps) {
        fd.set("lat", lat);
        fd.set("lon", lon);
        fd.set("accuracy", "8");
        fd.set("heading", "135");
      }
      const res = await fetch("/api/ingest/glasses", { method: "POST", headers: auth, body: fd });
      await record(`POST /api/ingest/glasses (multipart ${type})`, res);
    } finally {
      setBusy(false);
    }
  }

  async function sendVideoTwoStep() {
    setBusy(true);
    try {
      const video = await makeTestVideo();
      const step1 = await fetch("/api/ingest/glasses/uploads", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: "bril.webm", contentType: "video/webm", size: video.size }),
      });
      const s1 = (await record("POST /api/ingest/glasses/uploads", step1)) as { uploadUrl: string; headers: Record<string, string> } | null;
      if (!step1.ok || !s1) return;
      const headers: Record<string, string> = { "content-type": "video/webm" };
      if (s1.uploadUrl.includes("/api/ingest/glasses/uploads/local")) headers.authorization = `Bearer ${token}`;
      const put = await fetch(s1.uploadUrl, { method: "PUT", headers, body: video });
      const s2 = (await record("PUT <uploadUrl>", put)) as { url: string } | null;
      if (!put.ok || !s2) return;
      const fin = await fetch("/api/ingest/glasses", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: s2.url, contentType: "video/webm", type: "video", capturedAt: new Date().toISOString(), durationMs: 2500, ...(withGps ? { lat: Number(lat), lon: Number(lon) } : {}) }),
      });
      await record("POST /api/ingest/glasses (JSON fileUrl)", fin);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> 1. Apparaattoken
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="isg_… (plak een token of maak een simulatorapparaat)" className="flex-1 font-mono text-xs" aria-label="Apparaattoken" data-testid="sim-token" />
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => createDevice({ name: `Simulator ${new Date().toLocaleString("nl-NL")}`, kind: "meta-rayban", userId }), { onSuccess: (d) => setToken(d.token) })}
            data-testid="sim-create-device"
          >
            Maak simulatorapparaat
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Radio className="size-4" /> 2. Status
        </h2>
        <Button variant="outline" className="w-fit" disabled={!token} onClick={refreshStatus} data-testid="sim-status">
          Waar komen captures terecht?
        </Button>
        {status ? (
          <p className="text-sm">
            {status.activeInspection ? (
              <>
                In de lopende schouw{" "}
                <Link className="text-primary hover:underline" href={`/schouwen/${status.activeInspection.id}/media`}>
                  {status.activeInspection.title}
                </Link>
              </>
            ) : (
              <>
                Geen lopende schouw — captures gaan naar de{" "}
                <Link className="text-primary hover:underline" href="/inbox">
                  inbox
                </Link>
                .
              </>
            )}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">3. Testmedia versturen</h2>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={withGps} onCheckedChange={(v) => setWithGps(Boolean(v))} /> GPS meesturen (uit = locatie wordt afgeleid uit de GPS-track van de telefoon)
        </label>
        {withGps ? (
          <div className="flex gap-2">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} className="w-40" aria-label="Latitude" />
            <Input value={lon} onChange={(e) => setLon(e.target.value)} className="w-40" aria-label="Longitude" />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!token || busy} onClick={async () => sendMultipart(await makeTestPhoto(new Date().toLocaleString("nl-NL")), "bril.jpg", "photo")} data-testid="sim-send-photo">
            <Camera /> Foto (multipart)
          </Button>
          <Button variant="outline" disabled={!token || busy} onClick={() => sendMultipart(makeTone(2), "bril.wav", "audio")}>
            <Mic /> Audio (multipart)
          </Button>
          <Button variant="outline" disabled={!token || busy} onClick={sendVideoTwoStep}>
            <Video /> Video (tweestaps-upload)
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Log</h2>
        {log.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen verzoeken.</p> : null}
        <ul className="flex flex-col gap-2" data-testid="sim-log">
          {log.map((l, i) => (
            <li key={i} className="rounded border p-2 text-xs">
              <p className="font-mono">
                {l.at} · {l.request} → <span className={l.status < 300 ? "text-emerald-700" : "text-destructive"}>{l.status}</span>
              </p>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">{JSON.stringify(l.body, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

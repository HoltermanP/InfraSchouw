"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Trash2, CloudSun, Play } from "lucide-react";
import { createLocalInspection } from "@/lib/offline/field-store";
import { reverseGeocode } from "@/lib/geo/pdok";
import { fetchWeather, formatWeather, type Weather } from "@/lib/geo/weather";
import { TEMPLATE_PHASE_LABELS, STATION_TYPES, STATION_TYPE_LABELS, type TemplatePhase } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { Bootstrap } from "./use-bootstrap";
import type { FieldRoute } from "./nav";
import { useGeo } from "./use-geo";

const input = "min-h-12 w-full rounded-xl bg-white/10 px-3 text-base outline-none focus:ring-2 focus:ring-amber-400";

export function NewInspection({
  data,
  initialProjectId,
  initialStationId,
  go,
}: {
  data: Bootstrap;
  initialProjectId: string | null;
  initialStationId: string | null;
  go: (r: FieldRoute, replace?: boolean) => void;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [stationChoice, setStationChoice] = useState<string>(initialStationId ?? "");
  const [newStation, setNewStation] = useState({ code: "", name: "", stationType: "compact" });
  const [participants, setParticipants] = useState<{ name: string; organization: string; role: string }[]>([]);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [busy, setBusy] = useState(false);
  const { fix } = useGeo();

  const template = data.templates.find((t) => t.id === templateId) ?? null;
  const stations = useMemo(() => data.stations.filter((s) => !projectId || s.projectId === projectId || s.projectId === null), [data.stations, projectId]);

  // Address (PDOK) and weather (Open-Meteo) once a position is known and online.
  const havePos = Boolean(fix);
  useEffect(() => {
    if (!havePos || !fix || !navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      const [addr, w] = await Promise.all([reverseGeocode(fix.lat, fix.lon), fetchWeather(fix.lat, fix.lon)]);
      if (cancelled) return;
      if (addr) setAddress(addr.address);
      if (w) setWeather(w);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [havePos]);

  const autoTitle = useMemo(() => {
    if (!template) return "";
    const date = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
    const station = stationChoice && stationChoice !== "new" ? data.stations.find((s) => s.id === stationChoice)?.code : stationChoice === "new" ? newStation.code : null;
    const where = station ?? address?.split(",")[0] ?? (projectId ? data.projects.find((p) => p.id === projectId)?.number : null) ?? "locatie";
    return `${template.name} – ${where} – ${date}`;
  }, [template, stationChoice, newStation.code, address, projectId, data.stations, data.projects]);
  const effectiveTitle = titleTouched ? title : autoTitle;

  async function start() {
    if (!template) return;
    setBusy(true);
    const isNewStation = template.isStation && stationChoice === "new" && newStation.code.trim();
    const local = await createLocalInspection(
      { orgId: data.org.id, userId: data.user.id },
      {
        templateId: template.id,
        projectId,
        stationId: template.isStation && stationChoice && stationChoice !== "new" ? stationChoice : null,
        newStation: isNewStation
          ? { id: crypto.randomUUID(), code: newStation.code.trim(), name: newStation.name.trim() || newStation.code.trim(), stationType: newStation.stationType, lat: fix?.lat ?? null, lon: fix?.lon ?? null, address }
          : null,
        title: effectiveTitle || template.name,
        weather,
        address,
        lat: fix?.lat ?? null,
        lon: fix?.lon ?? null,
        participants: participants.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), organization: p.organization || null, role: p.role || null })),
      },
    );
    go({ view: "inspection", id: local.id, step: "vastleggen" }, true);
  }

  const grouped = useMemo(() => {
    const m = new Map<string, typeof data.templates>();
    for (const t of data.templates) m.set(t.phase, [...(m.get(t.phase) ?? []), t]);
    return [...m.entries()];
  }, [data]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-32">
      <section>
        <h1 className="mb-3 text-xl font-bold">1. Kies het schouwtype</h1>
        <div className="flex flex-col gap-4">
          {grouped.map(([phase, list]) => (
            <div key={phase}>
              <p className="mb-1 text-xs tracking-wide text-white/50 uppercase">{TEMPLATE_PHASE_LABELS[phase as TemplatePhase] ?? phase}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    aria-pressed={templateId === t.id}
                    className={cn("min-h-16 rounded-xl p-3 text-left", templateId === t.id ? "bg-amber-400 text-black" : "bg-white/10")}
                  >
                    <span className="block font-semibold">{t.name}</span>
                    <span className={cn("block text-xs", templateId === t.id ? "text-black/70" : "text-white/60")}>{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {template ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">2. Project en object</h2>
            <label className="flex flex-col gap-1 text-sm">
              Project
              <select className={input} value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)} aria-label="Project">
                <option value="" className="text-black">
                  Losse schouw (later koppelen)
                </option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id} className="text-black">
                    {p.number} – {p.name}
                  </option>
                ))}
              </select>
            </label>
            {template.isStation ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  MS-station
                  <select className={input} value={stationChoice} onChange={(e) => setStationChoice(e.target.value)} aria-label="MS-station">
                    <option value="" className="text-black">
                      Kies een station…
                    </option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id} className="text-black">
                        {s.code} – {s.name}
                      </option>
                    ))}
                    <option value="new" className="text-black">
                      + Nieuw station aanmaken
                    </option>
                  </select>
                </label>
                {stationChoice === "new" ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input className={input} placeholder="Stationsnummer" aria-label="Stationsnummer" value={newStation.code} onChange={(e) => setNewStation({ ...newStation, code: e.target.value })} />
                    <input className={input} placeholder="Naam" aria-label="Stationsnaam" value={newStation.name} onChange={(e) => setNewStation({ ...newStation, name: e.target.value })} />
                    <select className={input} value={newStation.stationType} onChange={(e) => setNewStation({ ...newStation, stationType: e.target.value })} aria-label="Stationstype">
                      {STATION_TYPES.map((t) => (
                        <option key={t} value={t} className="text-black">
                          {STATION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">3. Deelnemers</h2>
            <p className="text-sm text-white/60">Ook externen zonder account (aannemer, netbeheerder, gemeente).</p>
            {participants.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <input className={input} placeholder="Naam" aria-label={`Naam deelnemer ${i + 1}`} value={p.name} onChange={(e) => setParticipants(participants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={input} placeholder="Organisatie" aria-label={`Organisatie deelnemer ${i + 1}`} value={p.organization} onChange={(e) => setParticipants(participants.map((x, j) => (j === i ? { ...x, organization: e.target.value } : x)))} />
                <input className={input} placeholder="Rol" aria-label={`Rol deelnemer ${i + 1}`} value={p.role} onChange={(e) => setParticipants(participants.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                <button type="button" onClick={() => setParticipants(participants.filter((_, j) => j !== i))} className="min-h-12 rounded-xl bg-white/10 px-3" aria-label="Verwijder deelnemer">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setParticipants([...participants, { name: "", organization: "", role: "" }])} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-white/30">
              <Plus className="size-4" /> Deelnemer toevoegen
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">4. Titel</h2>
            <input
              className={input}
              value={effectiveTitle}
              aria-label="Titel"
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
            />
            <div className="flex flex-wrap gap-3 text-xs text-white/60">
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {fix ? `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} (±${Math.round(fix.accuracy ?? 0)} m)` : "Locatie bepalen…"}
                {address ? ` · ${address}` : ""}
              </span>
              <span className="flex items-center gap-1">
                <CloudSun className="size-3.5" /> {weather ? formatWeather(weather) : navigator.onLine ? "Weer ophalen…" : "Weer: offline"}
              </span>
            </div>
          </section>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-neutral-950/95 p-4">
            <button
              type="button"
              onClick={start}
              disabled={busy || (template.isStation && !stationChoice) || (stationChoice === "new" && !newStation.code.trim())}
              className="mx-auto flex min-h-16 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xl font-bold text-black disabled:opacity-40"
              data-testid="start-inspection"
            >
              <Play className="size-6" /> Start schouw
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

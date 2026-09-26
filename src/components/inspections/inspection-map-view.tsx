"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { ChevronLeft, ChevronRight, Camera as CameraIcon, FileText, MapPin, Move, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { LazyMap } from "@/components/map/lazy-map";
import type { MapSelection } from "@/components/map/infra-map";
import { mapSnapshot } from "@/components/map/snapshot";
import { Button } from "@/components/ui/button";
import { AiProposalBadge, CategoryBadge, PriorityBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { setCaptureLocation } from "@/app/(app)/schouwen/actions";
import { CAPTURE_TYPE_LABELS, LOCATION_SOURCE_LABELS, type FindingCategory, type Priority } from "@/lib/domain";
import { formatRd, formatWgs84, headingLabel } from "@/lib/geo/rd";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import type { CaptureDto } from "@/lib/report/dto";
import { cn } from "@/lib/utils";

export type MapFindingDto = { id: string; title: string; description: string; priority: Priority; category: FindingCategory; lat: number | null; lon: number | null; captureIds: string[]; aiAccepted: boolean; recommendation: string | null };

export function CaptureMedia({ c, large = false }: { c: CaptureDto; large?: boolean }) {
  if (!c.url && !c.thumb) return <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">{c.textContent ?? CAPTURE_TYPE_LABELS[c.type]}</div>;
  if (c.type === "video") return <video src={c.url ?? undefined} poster={c.thumb ?? undefined} controls preload="metadata" className="w-full rounded-lg bg-black" />;
  if (c.type === "audio") return <audio src={c.url ?? undefined} controls preload="metadata" className="w-full" />;
  if (c.type === "note" || c.type === "measurement" || c.type === "scan") return <p className="rounded-lg bg-muted p-4 text-sm">{c.textContent}</p>;
  return <img src={(large ? c.url : c.thumb) ?? c.thumb ?? undefined} alt={c.analysis?.caption ?? `Foto ${c.seq ?? ""}`} className="w-full rounded-lg bg-muted object-contain" loading="lazy" />;
}

export function CaptureInfo({ c, inspectionId, canEdit, onMove }: { c: CaptureDto; inspectionId: string; canEdit: boolean; onMove?: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Tijd</dt>
          <dd>{fmtDateTime(c.capturedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Kijkrichting</dt>
          <dd>{headingLabel(c.heading)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">RD (x, y)</dt>
          <dd className="font-mono text-xs">{formatRd(c.rdX, c.rdY)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">WGS84</dt>
          <dd className="font-mono text-xs">{formatWgs84(c.lat, c.lon)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Locatiebron</dt>
          <dd>
            {LOCATION_SOURCE_LABELS[c.locationSource]}
            {c.accuracy !== null ? ` (±${Math.round(c.accuracy)} m)` : ""}
          </dd>
        </div>
        {c.durationMs ? (
          <div>
            <dt className="text-xs text-muted-foreground">Duur</dt>
            <dd>{fmtDuration(c.durationMs)}</dd>
          </div>
        ) : null}
        {c.shot ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Shotlist</dt>
            <dd>{c.shot}</dd>
          </div>
        ) : null}
      </dl>
      {c.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {c.note ? (
        <div>
          <p className="text-xs text-muted-foreground">Notitie schouwer</p>
          <p>{c.note}</p>
        </div>
      ) : null}
      {c.analysis ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="mb-1 flex items-center gap-2">
            <AiProposalBadge />
            <span className="text-xs text-muted-foreground">Beeldanalyse</span>
          </div>
          <p className="font-medium">{c.analysis.caption}</p>
          <p className="mt-1 text-muted-foreground">{c.analysis.description}</p>
          {c.analysis.nameplate ? (
            <p className="mt-2 text-xs">
              <span className="font-semibold">Typeplaat: </span>
              {Object.entries(c.analysis.nameplate)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          ) : null}
          {c.analysis.privacy.persons_recognizable || c.analysis.privacy.license_plates_visible ? (
            <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
              Privacy: {[c.analysis.privacy.persons_recognizable && "herkenbare personen", c.analysis.privacy.license_plates_visible && "leesbare kentekens"].filter(Boolean).join(" en ")} — overweeg vervagen in de annotatie-editor.
              {c.privacyBlurred ? " (vervaagd)" : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      {c.transcript.length ? (
        <div>
          <p className="text-xs text-muted-foreground">Gesproken tekst (zelfde tijdvenster)</p>
          {c.transcript.map((t, i) => (
            <p key={i} className="border-l-2 pl-2 italic">
              “{t}”
            </p>
          ))}
        </div>
      ) : null}
      {c.findings.length ? (
        <div>
          <p className="text-xs text-muted-foreground">Gekoppelde bevindingen</p>
          <ul className="list-disc pl-4">
            {c.findings.map((f) => (
              <li key={f.id}>
                <Link href={`/schouwen/${inspectionId}/bevindingen#finding-${f.id}`} className="hover:underline">
                  {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href={`/schouwen/${inspectionId}/verslag#capture-${c.id}`} className="inline-flex items-center gap-1 text-primary hover:underline" data-testid="show-in-report">
          <FileText className="size-4" /> Toon in verslag
        </Link>
        {canEdit && onMove ? (
          <button type="button" onClick={onMove} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Move className="size-4" /> Locatie corrigeren
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InspectionMapView({
  inspectionId,
  reportId,
  captures,
  findings,
  track,
  area,
  klic,
  canEdit,
}: {
  inspectionId: string;
  reportId: string | null;
  captures: CaptureDto[];
  findings: MapFindingDto[];
  track: GeoJSON.LineString | null;
  area: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  klic: GeoJSON.FeatureCollection | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("capture");
  const [selected, setSelected] = useState<MapSelection>(initial ? { kind: "capture", id: initial } : null);
  const [moving, setMoving] = useState<string | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const { run } = useAction();
  const located = useMemo(() => captures.filter((c) => c.lat !== null && c.lon !== null && c.type !== "audio"), [captures]);
  const navigable = useMemo(() => located.filter((c) => c.type === "photo" || c.type === "video" || c.type === "sketch" || c.type === "note" || c.type === "measurement" || c.type === "scan"), [located]);
  const selCapture = selected?.kind === "capture" ? captures.find((c) => c.id === selected.id) : null;
  const selFinding = selected?.kind === "finding" ? findings.find((f) => f.id === selected.id) : null;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!selCapture) return;
      const idx = navigable.findIndex((c) => c.id === selCapture.id);
      const next = navigable[(idx + dir + navigable.length) % navigable.length];
      if (next) setSelected({ kind: "capture", id: next.id });
    },
    [selCapture, navigable],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const touchX = useRef<number | null>(null);

  async function snapshot() {
    if (!mapRef.current || !reportId) return;
    const blob = await mapSnapshot(
      mapRef.current,
      located.filter((c) => c.seq).map((c) => ({ lat: c.lat!, lon: c.lon!, seq: c.seq })),
      findings.filter((f) => f.lat !== null).map((f) => ({ lat: f.lat!, lon: f.lon!, priority: f.priority })),
    );
    const fd = new FormData();
    fd.set("file", blob, "kaart.png");
    const res = await fetch(`/api/reports/${reportId}/snapshot`, { method: "POST", body: fd });
    if (res.ok) {
      toast.success("Kaartbeeld vastgelegd voor het verslag");
      router.refresh();
    } else toast.error("Kaartbeeld opslaan mislukt");
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:px-8 lg:flex-row">
      <div className="relative h-[60vh] min-h-96 flex-1 lg:h-[calc(100dvh_-_16rem)]">
        <LazyMap
          className="h-full"
          captures={located.map((c) => ({ id: c.id, type: c.type, lat: c.lat!, lon: c.lon!, seq: c.seq, heading: c.heading, label: `${CAPTURE_TYPE_LABELS[c.type]} ${c.seq ?? ""}` }))}
          findings={findings.filter((f) => f.lat !== null && f.lon !== null).map((f) => ({ id: f.id, lat: f.lat!, lon: f.lon!, priority: f.priority, title: f.title }))}
          track={track}
          area={area}
          klic={klic}
          selected={selected}
          onSelect={setSelected}
          draggableCaptureId={moving}
          onCaptureDragEnd={(id, lat, lon) => {
            void run(() => setCaptureLocation(id, lat, lon));
            setMoving(null);
          }}
          onMapReady={(m) => (mapRef.current = m)}
        />
        <div className="absolute right-2 bottom-8 z-10 flex flex-col items-end gap-1 text-xs">
          <span className="rounded bg-white/90 px-2 py-1 shadow">
            {located.length} op kaart · {captures.length - located.length} zonder locatie
          </span>
          {reportId && canEdit ? (
            <Button size="sm" variant="secondary" onClick={snapshot} className="shadow">
              <ImageIcon /> Kaartbeeld voor verslag vastleggen
            </Button>
          ) : null}
        </div>
      </div>
      <aside className="w-full shrink-0 lg:w-[26rem]" aria-label="Details">
        {selCapture ? (
          <div
            className="flex flex-col gap-3 rounded-lg border p-3"
            data-testid="map-side-panel"
            onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0]!.clientX - touchX.current;
              if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {CAPTURE_TYPE_LABELS[selCapture.type]} {selCapture.seq ? `${selCapture.seq}` : ""}
              </h2>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label="Vorige">
                  <ChevronLeft />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label="Volgende">
                  <ChevronRight />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setSelected(null)} aria-label="Sluiten">
                  <X />
                </Button>
              </div>
            </div>
            <CaptureMedia c={selCapture} large />
            <CaptureInfo c={selCapture} inspectionId={inspectionId} canEdit={canEdit} onMove={() => setMoving(selCapture.id)} />
            {moving === selCapture.id ? <p className="rounded bg-amber-100 p-2 text-xs text-amber-900">Sleep de marker op de kaart naar de juiste plek.</p> : null}
          </div>
        ) : selFinding ? (
          <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="map-side-panel">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selFinding.title}</h2>
              <Button size="icon-sm" variant="ghost" onClick={() => setSelected(null)} aria-label="Sluiten">
                <X />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <PriorityBadge priority={selFinding.priority} />
              <CategoryBadge category={selFinding.category} />
              {!selFinding.aiAccepted ? <AiProposalBadge /> : null}
            </div>
            <p className="text-sm">{selFinding.description}</p>
            {selFinding.recommendation ? <p className="text-sm text-muted-foreground">Aanbeveling: {selFinding.recommendation}</p> : null}
            <div className="grid grid-cols-3 gap-2">
              {selFinding.captureIds.map((id) => {
                const c = captures.find((x) => x.id === id);
                return c ? (
                  <button key={id} type="button" onClick={() => setSelected({ kind: "capture", id })} className="overflow-hidden rounded">
                    <CaptureMedia c={c} />
                  </button>
                ) : null;
              })}
            </div>
            <Link href={`/schouwen/${inspectionId}/verslag#finding-${selFinding.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <FileText className="size-4" /> Toon in verslag
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <MapPin className="size-4" /> Klik op een marker voor details. Pijltjestoetsen of vegen bladert door de foto&apos;s.
            </p>
            <p className="flex items-center gap-2">
              <CameraIcon className="size-4" /> Rode lijn = gelopen GPS-track; gekleurde spelden = bevindingen per prioriteit.
            </p>
            <ul className={cn("mt-2 grid grid-cols-4 gap-2")}>
              {navigable.filter((c) => c.type === "photo" || c.type === "video" || c.type === "sketch").slice(0, 16).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected({ kind: "capture", id: c.id })} className="block overflow-hidden rounded" aria-label={`Open ${CAPTURE_TYPE_LABELS[c.type]} ${c.seq ?? ""}`}>
                    <CaptureMedia c={c} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

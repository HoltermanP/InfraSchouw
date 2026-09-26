"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PDOK_TILES, tilesForBbox } from "@/lib/geo/pdok";

function bboxOfArea(area: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  const polys = area.type === "Polygon" ? [area.coordinates] : area.coordinates;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const p of polys)
    for (const [lon, lat] of p[0] ?? []) {
      minLon = Math.min(minLon, lon!);
      maxLon = Math.max(maxLon, lon!);
      minLat = Math.min(minLat, lat!);
      maxLat = Math.max(maxLat, lat!);
    }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * "Gebied offline beschikbaar maken": fetches the PDOK tiles of a project area
 * (or ±600 m around the current position); the service worker stores them
 * in its cache-first tile cache.
 */
export function OfflineAreaButton({ projects }: { projects: { id: string; number: string; name: string; areaGeojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null }[] }) {
  const withArea = projects.filter((p) => p.areaGeojson);
  const [target, setTarget] = useState<string>(withArea[0]?.id ?? "here");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    let bbox: [number, number, number, number];
    if (target === "here") {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }),
      ).catch(() => null);
      if (!pos) {
        setMessage("Locatie niet beschikbaar.");
        return;
      }
      const d = 0.006;
      bbox = [pos.coords.longitude - d * 1.6, pos.coords.latitude - d, pos.coords.longitude + d * 1.6, pos.coords.latitude + d];
    } else {
      const p = withArea.find((x) => x.id === target)!;
      bbox = bboxOfArea(p.areaGeojson!);
    }
    const urls = [...tilesForBbox(bbox, 12, 18, PDOK_TILES.brt, 3000), ...tilesForBbox(bbox, 14, 17, PDOK_TILES.luchtfoto, 1500)];
    setProgress({ done: 0, total: urls.length });
    let done = 0;
    let failed = 0;
    const queue = [...urls];
    const worker = async () => {
      while (queue.length) {
        const url = queue.shift()!;
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        if (done % 20 === 0 || done === urls.length) setProgress({ done, total: urls.length });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setProgress(null);
    setMessage(failed ? `${done - failed} van ${urls.length} kaarttegels opgeslagen (${failed} mislukt).` : `${urls.length} kaarttegels opgeslagen voor offline gebruik.`);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-11 flex-1 rounded-lg bg-white/10 px-2 text-sm" aria-label="Gebied">
          {withArea.map((p) => (
            <option key={p.id} value={p.id} className="text-black">
              Projectgebied {p.number}
            </option>
          ))}
          <option value="here" className="text-black">
            Rond mijn huidige locatie
          </option>
        </select>
        <button type="button" onClick={run} disabled={Boolean(progress)} className="flex min-h-11 items-center gap-2 rounded-lg bg-white/15 px-3 text-sm font-semibold">
          <Download className="size-4" /> Gebied offline beschikbaar maken
        </button>
      </div>
      {progress ? (
        <div className="h-2 overflow-hidden rounded bg-white/10" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
          <div className="h-full bg-amber-400" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      ) : null}
      {message ? <p className="text-xs text-white/70">{message}</p> : null}
    </div>
  );
}

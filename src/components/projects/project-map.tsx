"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import { PenLine, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyMap } from "@/components/map/lazy-map";
import type { MapFinding, MapPoint } from "@/components/map/infra-map";
import { useAction } from "@/hooks/use-action";
import { setProjectArea } from "@/app/(app)/projecten/actions";

/**
 * Project overview map: project area, all inspections (start points),
 * stations, findings and KLIC layer. Project leaders can draw the area.
 */
export function ProjectMap({
  projectId,
  area,
  inspections,
  stations,
  findings,
  klic,
  canEdit,
}: {
  projectId: string;
  area: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  inspections: MapPoint[];
  stations: MapPoint[];
  findings: (MapFinding & { inspectionId: string })[];
  klic: GeoJSON.FeatureCollection | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const mapRef = useRef<MlMap | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("draw") as GeoJSONSource | undefined;
    const ring = vertices.length >= 3 ? [...vertices, vertices[0]!] : vertices;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...(ring.length >= 2 ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: ring }, properties: {} }] : []),
        ...vertices.map((v) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: v }, properties: {} })),
      ],
    };
    src?.setData(data);
  }, [vertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawing) return;
    const onClick = (e: MapMouseEvent) => setVertices((v) => [...v, [e.lngLat.lng, e.lngLat.lat]]);
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [drawing]);

  const points = [...inspections, ...stations];
  return (
    <div className="relative h-[28rem]">
      <LazyMap
        className="h-full"
        area={area}
        points={points}
        findings={findings}
        klic={klic}
        onSelect={(sel) => {
          if (drawing || !sel) return;
          if (sel.kind === "point") {
            const p = points.find((x) => x.id === sel.id);
            router.push(p?.kind === "station" ? `/stations/${sel.id}` : `/schouwen/${sel.id}`);
          } else if (sel.kind === "finding") {
            const f = findings.find((x) => x.id === sel.id);
            if (f) router.push(`/schouwen/${f.inspectionId}/bevindingen#finding-${f.id}`);
          }
        }}
        onMapReady={(m) => {
          mapRef.current = m;
          m.addSource("draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#f59e0b", "line-width": 3 } });
          m.addLayer({ id: "draw-points", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#f59e0b", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        }}
      />
      {canEdit ? (
        <div className="absolute right-12 bottom-8 z-10 flex gap-1">
          {drawing ? (
            <>
              <span className="self-center rounded bg-white/90 px-2 py-1 text-xs shadow">Klik punten op de kaart ({vertices.length})</span>
              <Button
                size="sm"
                disabled={vertices.length < 3 || pending}
                onClick={async () => {
                  const res = await run(() => setProjectArea(projectId, { type: "Polygon", coordinates: [[...vertices, vertices[0]!]] }));
                  if (res.ok) {
                    setDrawing(false);
                    setVertices([]);
                  }
                }}
              >
                <Check /> Opslaan
              </Button>
              <Button size="sm" variant="secondary" onClick={() => {
                setDrawing(false);
                setVertices([]);
              }}>
                <X /> Annuleren
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" className="shadow" onClick={() => setDrawing(true)} data-testid="draw-area">
                <PenLine /> {area ? "Gebied opnieuw tekenen" : "Projectgebied tekenen"}
              </Button>
              {area ? (
                <Button size="sm" variant="secondary" className="shadow" aria-label="Projectgebied verwijderen" onClick={() => confirm("Projectgebied verwijderen?") && run(() => setProjectArea(projectId, null))}>
                  <Trash2 />
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import Supercluster from "supercluster";
import { Layers, Crosshair } from "lucide-react";
import { PDOK_ATTRIBUTION, PDOK_TILES } from "@/lib/geo/pdok";
import { PRIORITY_COLORS, type CaptureType, type Priority } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type MapCapture = { id: string; type: CaptureType; lat: number; lon: number; seq: number | null; heading?: number | null; label?: string };
export type MapFinding = { id: string; lat: number; lon: number; priority: Priority; title: string; seq?: number | null };
export type MapPoint = { id: string; lat: number; lon: number; label: string; color?: string; kind: "inspection" | "station" };
export type MapSelection = { kind: "capture" | "finding" | "point"; id: string } | null;

export type InfraMapProps = {
  className?: string;
  captures?: MapCapture[];
  findings?: MapFinding[];
  points?: MapPoint[];
  track?: GeoJSON.LineString | null;
  area?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  klic?: GeoJSON.FeatureCollection | null;
  selected?: MapSelection;
  onSelect?: (sel: MapSelection) => void;
  /** Capture whose marker can be dragged to correct its location. */
  draggableCaptureId?: string | null;
  onCaptureDragEnd?: (id: string, lat: number, lon: number) => void;
  center?: [number, number];
  zoom?: number;
  fitToData?: boolean;
  onMapReady?: (map: MlMap) => void;
  showUserLocation?: boolean;
  basemap?: "brt" | "luchtfoto";
  interactive?: boolean;
};

const TYPE_ICON: Record<CaptureType, string> = {
  photo: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  audio: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
  sketch: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  measurement: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/>',
  scan: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/>',
};

const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    brt: { type: "raster", tiles: [PDOK_TILES.brt], tileSize: 256, maxzoom: 19, attribution: PDOK_ATTRIBUTION },
    luchtfoto: { type: "raster", tiles: [PDOK_TILES.luchtfoto], tileSize: 256, maxzoom: 21, attribution: PDOK_ATTRIBUTION },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#eef1f4" } },
    { id: "brt", type: "raster", source: "brt" },
    { id: "luchtfoto", type: "raster", source: "luchtfoto", layout: { visibility: "none" } },
  ],
};

function markerEl(html: string, className: string, title: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.title = title;
  el.setAttribute("aria-label", title);
  el.innerHTML = html;
  return el;
}

function captureMarkerHtml(c: MapCapture, selected: boolean) {
  const ring = selected ? "box-shadow:0 0 0 3px #f59e0b;" : "";
  const heading =
    c.heading !== null && c.heading !== undefined
      ? `<span style="position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%) rotate(${c.heading}deg);"><span style="position:absolute;left:-5px;top:-26px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #0f4c81;"></span></span>`
      : "";
  return `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#fff;border:2px solid #0f4c81;${ring}">${heading}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0f4c81" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TYPE_ICON[c.type]}</svg>${
    c.seq ? `<span style="position:absolute;top:-8px;right:-10px;background:#0f4c81;color:#fff;border-radius:9999px;font:600 10px/1 system-ui;padding:2px 4px;">${c.seq}</span>` : ""
  }</span>`;
}

function allCoords(props: InfraMapProps): [number, number][] {
  const out: [number, number][] = [];
  props.captures?.forEach((c) => out.push([c.lon, c.lat]));
  props.findings?.forEach((f) => out.push([f.lon, f.lat]));
  props.points?.forEach((p) => out.push([p.lon, p.lat]));
  props.track?.coordinates.forEach((c) => out.push([c[0]!, c[1]!]));
  if (props.area) {
    const polys = props.area.type === "Polygon" ? [props.area.coordinates] : props.area.coordinates;
    polys.forEach((p) => p[0]?.forEach((c) => out.push([c[0]!, c[1]!])));
  }
  return out;
}

export function InfraMap(props: InfraMapProps) {
  const {
    className,
    captures = [],
    findings = [],
    points = [],
    track,
    area,
    klic,
    selected,
    onSelect,
    draggableCaptureId,
    onCaptureDragEnd,
    fitToData = true,
    onMapReady,
    interactive = true,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<"brt" | "luchtfoto">(props.basemap ?? "brt");
  const [showKlic, setShowKlic] = useState(true);
  const [zoomTick, setZoomTick] = useState(0);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onDragRef = useRef(onCaptureDragEnd);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onDragRef.current = onCaptureDragEnd;
  });

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle,
      center: props.center ? [props.center[1], props.center[0]] : [6.0944, 52.5125],
      zoom: props.zoom ?? 14,
      maxZoom: 21,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      interactive,
    });
    mapRef.current = map;
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      if (props.showUserLocation) map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }), "top-right");
    }
    map.on("load", () => {
      map.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#0f4c81", "fill-opacity": 0.08 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#0f4c81", "line-width": 2, "line-dasharray": [2, 1] } });
      map.addSource("klic", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "klic-line", type: "line", source: "klic", paint: { "line-color": ["coalesce", ["get", "color"], "#555"], "line-width": 2.5, "line-opacity": 0.85 } });
      map.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "track-casing", type: "line", source: "track", paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
      map.addLayer({ id: "track-line", type: "line", source: "track", paint: { "line-color": "#e11d48", "line-width": 3 }, layout: { "line-cap": "round", "line-join": "round" } });
      setReady(true);
      onMapReady?.(map);
    });
    map.on("zoomend", () => setZoomTick((t) => t + 1));
    map.on("moveend", () => setZoomTick((t) => t + 1));
    return () => {
      markers.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("brt", "visibility", basemap === "brt" ? "visible" : "none");
    map.setLayoutProperty("luchtfoto", "visibility", basemap === "luchtfoto" ? "visible" : "none");
  }, [basemap, ready]);

  // Vector overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("area") as maplibregl.GeoJSONSource).setData(
      area ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: area, properties: {} }] } : { type: "FeatureCollection", features: [] },
    );
    (map.getSource("track") as maplibregl.GeoJSONSource).setData(
      track ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: track, properties: {} }] } : { type: "FeatureCollection", features: [] },
    );
    (map.getSource("klic") as maplibregl.GeoJSONSource).setData(klic && showKlic ? klic : { type: "FeatureCollection", features: [] });
  }, [area, track, klic, showKlic, ready]);

  // Fit to data once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitToData || fitted.current) return;
    const coords = allCoords(props);
    if (coords.length === 0) return;
    fitted.current = true;
    if (coords.length === 1) {
      map.jumpTo({ center: coords[0], zoom: 17 });
      return;
    }
    const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(b as LngLatBoundsLike, { padding: 50, maxZoom: 18, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, captures.length, findings.length, points.length, track, area]);

  const index = useMemo(() => {
    const sc = new Supercluster<{ id: string }>({ radius: 50, maxZoom: 18 });
    sc.load(captures.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id } })));
    return sc;
  }, [captures]);

  // HTML markers (clustered captures, findings, points).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const bounds = map.getBounds();
    const zoom = Math.round(map.getZoom());
    const byId = new Map(captures.map((c) => [c.id, c]));
    const clusters = index.getClusters([bounds.getWest() - 0.01, bounds.getSouth() - 0.01, bounds.getEast() + 0.01, bounds.getNorth() + 0.01], zoom);
    for (const f of clusters) {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      const props = f.properties as { cluster?: boolean; point_count?: number; cluster_id?: number; id?: string };
      if (props.cluster) {
        const el = markerEl(
          `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#0f4c81;color:#fff;font:700 13px system-ui;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${props.point_count}</span>`,
          "maplibre-cluster",
          `${props.point_count} captures — klik om in te zoomen`,
        );
        el.onclick = () => map.easeTo({ center: [lon, lat], zoom: Math.min(index.getClusterExpansionZoom(props.cluster_id!), 20) });
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
        continue;
      }
      const c = byId.get(props.id!);
      if (!c) continue;
      const isSel = selected?.kind === "capture" && selected.id === c.id;
      const el = markerEl(captureMarkerHtml(c, isSel), "maplibre-capture", c.label ?? `Capture ${c.seq ?? ""}`);
      el.dataset.captureId = c.id;
      el.onclick = (e) => {
        e.stopPropagation();
        onSelectRef.current?.({ kind: "capture", id: c.id });
      };
      const draggable = draggableCaptureId === c.id;
      const m = new maplibregl.Marker({ element: el, draggable }).setLngLat([c.lon, c.lat]).addTo(map);
      if (draggable) m.on("dragend", () => onDragRef.current?.(c.id, m.getLngLat().lat, m.getLngLat().lng));
      markers.current.push(m);
    }
    for (const f of findings) {
      const isSel = selected?.kind === "finding" && selected.id === f.id;
      const el = markerEl(
        `<svg width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 36 14 36s14-11.7 14-22.1C28 6.2 21.7 0 14 0z" fill="${PRIORITY_COLORS[f.priority]}" stroke="${isSel ? "#111" : "#fff"}" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="700" fill="#fff">!</text></svg>`,
        "maplibre-finding",
        `Bevinding: ${f.title}`,
      );
      el.dataset.findingId = f.id;
      el.onclick = (e) => {
        e.stopPropagation();
        onSelectRef.current?.({ kind: "finding", id: f.id });
      };
      markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([f.lon, f.lat]).addTo(map));
    }
    for (const p of points) {
      const isSel = selected?.kind === "point" && selected.id === p.id;
      const color = p.color ?? (p.kind === "station" ? "#7c3aed" : "#0f4c81");
      const el = markerEl(
        `<span style="display:block;width:16px;height:16px;border-radius:${p.kind === "station" ? "3px" : "9999px"};background:${color};border:2px solid ${isSel ? "#f59e0b" : "#fff"};box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
        "maplibre-point",
        p.label,
      );
      el.onclick = (e) => {
        e.stopPropagation();
        onSelectRef.current?.({ kind: "point", id: p.id });
      };
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
    }
  }, [ready, index, captures, findings, points, selected, draggableCaptureId, zoomTick]);

  // Pan to the selection (e.g. "toon op kaart" from the report).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    const target =
      selected.kind === "capture" ? captures.find((c) => c.id === selected.id) : selected.kind === "finding" ? findings.find((f) => f.id === selected.id) : points.find((p) => p.id === selected.id);
    if (target) map.easeTo({ center: [target.lon, target.lat], zoom: Math.max(map.getZoom(), 17) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, ready]);

  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-muted", className)}>
      <div ref={container} className="absolute inset-0" data-testid="infra-map" />
      {interactive ? (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setBasemap((b) => (b === "brt" ? "luchtfoto" : "brt"))}
            className="flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1.5 text-xs font-medium shadow"
            aria-label="Wissel achtergrondkaart"
          >
            <Layers className="size-3.5" /> {basemap === "brt" ? "Luchtfoto" : "Kaart"}
          </button>
          {klic ? (
            <button
              type="button"
              onClick={() => setShowKlic((v) => !v)}
              className={cn("rounded-md px-2 py-1.5 text-xs font-medium shadow", showKlic ? "bg-amber-400 text-black" : "bg-white/95")}
              aria-pressed={showKlic}
            >
              KLIC-laag
            </button>
          ) : null}
          {captures.length || findings.length ? (
            <button
              type="button"
              onClick={() => {
                fitted.current = false;
                setZoomTick((t) => t + 1);
                const map = mapRef.current;
                const coords = allCoords(props);
                if (map && coords.length > 1) {
                  const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
                  map.fitBounds(b as LngLatBoundsLike, { padding: 50, maxZoom: 18 });
                }
              }}
              className="flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1.5 text-xs font-medium shadow"
              aria-label="Zoom naar alles"
            >
              <Crosshair className="size-3.5" /> Alles
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default InfraMap;

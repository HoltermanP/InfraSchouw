"use client";

import { useRouter } from "next/navigation";
import { LazyMap } from "@/components/map/lazy-map";
import type { MapPoint } from "@/components/map/infra-map";

/** Map of points (stations or inspections) that navigates on click. */
export function StationsMap({ points, area, hrefBase = "/stations", className = "h-80" }: { points: MapPoint[]; area?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; hrefBase?: string; className?: string }) {
  const router = useRouter();
  return (
    <div className={className}>
      <LazyMap className="h-full" points={points} area={area ?? null} onSelect={(sel) => sel?.kind === "point" && router.push(`${hrefBase}/${sel.id}`)} />
    </div>
  );
}

export type TrackPoint = { lat: number; lon: number; t: number; accuracy?: number | null };

export type MatchResult = {
  lat: number;
  lon: number;
  /** Time distance (ms) to the nearest track point used. */
  deltaMs: number;
  method: "exact" | "interpolated" | "nearest";
};

/**
 * Derive a location for a timestamp from a GPS track. Linear interpolation
 * between the surrounding points; if the timestamp is outside the track, the
 * nearest endpoint is used when it is within `maxGapMs`.
 */
export function matchTimestampToTrack(track: TrackPoint[], t: number, maxGapMs = 5 * 60_000): MatchResult | null {
  if (track.length === 0) return null;
  const pts = [...track].sort((a, b) => a.t - b.t);

  if (t <= pts[0]!.t) {
    const d = pts[0]!.t - t;
    return d <= maxGapMs ? { lat: pts[0]!.lat, lon: pts[0]!.lon, deltaMs: d, method: d === 0 ? "exact" : "nearest" } : null;
  }
  const last = pts[pts.length - 1]!;
  if (t >= last.t) {
    const d = t - last.t;
    return d <= maxGapMs ? { lat: last.lat, lon: last.lon, deltaMs: d, method: d === 0 ? "exact" : "nearest" } : null;
  }

  // Binary search for the segment containing t.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  if (a.t === t) return { lat: a.lat, lon: a.lon, deltaMs: 0, method: "exact" };
  const gap = b.t - a.t;
  const deltaMs = Math.min(t - a.t, b.t - t);
  if (gap > maxGapMs * 2) {
    // Large hole in the track: only trust the nearest point if it is close in time.
    if (deltaMs > maxGapMs) return null;
    const nearest = t - a.t <= b.t - t ? a : b;
    return { lat: nearest.lat, lon: nearest.lon, deltaMs, method: "nearest" };
  }
  const f = (t - a.t) / gap;
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    deltaMs,
    method: "interpolated",
  };
}

export type TimedItem = { id: string; t: number };
export type TimeWindow = { start: number; end: number };

/**
 * Link items (captures) to time windows (transcript segments). An item is
 * linked when it falls inside the window extended by `paddingMs` on both
 * sides. Returns, for each window, the ids of the linked items.
 */
export function linkItemsToWindows(windows: TimeWindow[], items: TimedItem[], paddingMs = 15_000): string[][] {
  return windows.map((w) =>
    items.filter((it) => it.t >= w.start - paddingMs && it.t <= w.end + paddingMs).map((it) => it.id),
  );
}

/** Build a GeoJSON LineString from track points (null when < 2 points). */
export function trackToLineString(track: TrackPoint[]): GeoJSON.LineString | null {
  const pts = [...track].sort((a, b) => a.t - b.t);
  const coords: [number, number][] = [];
  for (const p of pts) {
    const prev = coords[coords.length - 1];
    if (!prev || prev[0] !== p.lon || prev[1] !== p.lat) coords.push([p.lon, p.lat]);
  }
  return coords.length >= 2 ? { type: "LineString", coordinates: coords } : null;
}

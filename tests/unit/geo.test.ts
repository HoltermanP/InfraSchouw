import { describe, expect, it } from "vitest";
import { bboxOf, distanceMeters, formatRd, headingLabel, rdToWgs84, wgs84ToRd } from "@/lib/geo/rd";
import { linkItemsToWindows, matchTimestampToTrack, trackToLineString } from "@/lib/geo/track-matching";
import { latToTileY, lonToTileX, tilesForBbox } from "@/lib/geo/pdok";

describe("RD New conversion", () => {
  it("converts the Amersfoort reference point", () => {
    const { x, y } = wgs84ToRd(52.15517440, 5.38720621);
    expect(x).toBeCloseTo(155000, -1);
    expect(y).toBeCloseTo(463000, -1);
  });

  it("round-trips a Zwolle coordinate within a few centimetres", () => {
    const rd = wgs84ToRd(52.5125, 6.0944);
    const back = rdToWgs84(rd.x, rd.y);
    expect(distanceMeters({ lat: 52.5125, lon: 6.0944 }, back)).toBeLessThan(0.05);
    expect(rd.x).toBeGreaterThan(200000);
    expect(rd.y).toBeGreaterThan(500000);
  });

  it("formats RD and headings", () => {
    expect(formatRd(203000.123, 502000.5)).toBe("X 203000.12 · Y 502000.50");
    expect(formatRd(null, 1)).toBe("—");
    expect(headingLabel(90)).toBe("90° (O)");
    expect(headingLabel(359)).toBe("359° (N)");
  });

  it("computes a padded bbox", () => {
    const b = bboxOf([{ lat: 52.5, lon: 6.1 }, { lat: 52.51, lon: 6.12 }])!;
    expect(b[0]).toBeLessThan(6.1);
    expect(b[3]).toBeGreaterThan(52.51);
  });
});

describe("track matching", () => {
  const t0 = Date.parse("2026-09-01T10:00:00Z");
  const track = [
    { lat: 52.5, lon: 6.1, t: t0 },
    { lat: 52.501, lon: 6.1, t: t0 + 10_000 },
    { lat: 52.502, lon: 6.1, t: t0 + 20_000 },
  ];

  it("interpolates between points", () => {
    const m = matchTimestampToTrack(track, t0 + 5_000)!;
    expect(m.method).toBe("interpolated");
    expect(m.lat).toBeCloseTo(52.5005, 6);
  });

  it("uses exact points", () => {
    expect(matchTimestampToTrack(track, t0 + 10_000)).toMatchObject({ method: "exact", lat: 52.501 });
  });

  it("snaps to the nearest endpoint within the max gap and refuses beyond it", () => {
    expect(matchTimestampToTrack(track, t0 + 80_000)?.method).toBe("nearest");
    expect(matchTimestampToTrack(track, t0 + 20 * 60_000)).toBeNull();
    expect(matchTimestampToTrack([], t0)).toBeNull();
  });

  it("links captures to transcript windows with padding", () => {
    const windows = [
      { start: t0, end: t0 + 5_000 },
      { start: t0 + 60_000, end: t0 + 70_000 },
    ];
    const items = [
      { id: "a", t: t0 + 2_000 },
      { id: "b", t: t0 + 18_000 },
      { id: "c", t: t0 + 65_000 },
    ];
    expect(linkItemsToWindows(windows, items, 15_000)).toEqual([["a", "b"], ["c"]]);
  });

  it("builds a LineString without duplicate consecutive points", () => {
    const ls = trackToLineString([...track, { lat: 52.502, lon: 6.1, t: t0 + 30_000 }])!;
    expect(ls.coordinates).toHaveLength(3);
    expect(trackToLineString([track[0]!])).toBeNull();
  });
});

describe("tile math", () => {
  it("computes tile coordinates", () => {
    expect(Math.floor(lonToTileX(6.0944, 14))).toBe(8469);
    expect(Math.floor(latToTileY(52.5125, 14))).toBe(5373);
  });
  it("lists tiles for a bbox", () => {
    const urls = tilesForBbox([6.09, 52.51, 6.1, 52.52], 14, 15, "https://x/{z}/{x}/{y}.png");
    expect(urls.length).toBeGreaterThan(2);
    expect(urls[0]).toMatch(/^https:\/\/x\/14\/\d+\/\d+\.png$/);
  });
});

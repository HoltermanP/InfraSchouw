"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoFix } from "@/lib/capture-sources/types";
import { logGpsPoint } from "@/lib/offline/field-store";

/**
 * Continuous high-accuracy location plus compass heading. While an
 * inspection is active a track point is logged every `intervalSeconds`.
 */
export function useGeo(opts: { trackInspectionId?: string | null; intervalSeconds?: number } = {}) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const fixRef = useRef<GeoFix | null>(null);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Locatie is niet beschikbaar op dit apparaat.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const f: GeoFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          heading: headingRef.current ?? (Number.isFinite(pos.coords.heading) ? pos.coords.heading : null),
          t: pos.timestamp || Date.now(),
        };
        fixRef.current = f;
        setFix(f);
        setError(null);
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? "Geen toestemming voor locatie." : "Locatie niet beschikbaar."),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === "number") h = (360 - e.alpha) % 360;
      if (h !== null) {
        headingRef.current = h;
        setHeading(Math.round(h));
      }
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, onOrientation as EventListener);
    return () => window.removeEventListener(evt, onOrientation as EventListener);
  }, []);

  // Track logging.
  const inspectionId = opts.trackInspectionId;
  const interval = (opts.intervalSeconds ?? 5) * 1000;
  useEffect(() => {
    if (!inspectionId) return;
    let lastLogged = 0;
    const timer = setInterval(() => {
      const f = fixRef.current;
      if (!f || f.t === lastLogged) return;
      if (Date.now() - f.t > 60_000) return; // stale fix
      lastLogged = f.t;
      void logGpsPoint(inspectionId, { lat: f.lat, lon: f.lon, accuracy: f.accuracy, t: f.t });
    }, interval);
    return () => clearInterval(timer);
  }, [inspectionId, interval]);

  /** Latest fix with the current compass heading, for stamping a capture. */
  const current = (): GeoFix | null => (fixRef.current ? { ...fixRef.current, heading: headingRef.current ?? fixRef.current.heading } : null);

  return { fix, heading, error, current };
}

/** iOS requires a user gesture to enable compass events. */
export async function requestCompassPermission() {
  const DOE = (globalThis as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (DOE?.requestPermission) {
    try {
      await DOE.requestPermission();
    } catch {
      /* denied */
    }
  }
}

"use client";

import dynamic from "next/dynamic";

/** MapLibre needs the browser (WebGL): load the map client-side only. */
export const LazyMap = dynamic(() => import("./infra-map").then((m) => m.InfraMap), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-48 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">Kaart laden…</div>,
});

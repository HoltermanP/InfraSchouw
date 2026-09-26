"use client";

import dynamic from "next/dynamic";

/**
 * The field app renders entirely in the browser from IndexedDB, so the
 * service worker can serve this page offline.
 */
export const FieldAppClient = dynamic(() => import("@/components/field/field-app").then((m) => m.FieldApp), {
  ssr: false,
  loading: () => <div className="flex min-h-dvh items-center justify-center bg-neutral-950 text-white/70">Veld-app laden…</div>,
});

export const GlassesAppClient = dynamic(() => import("@/components/field/glasses-app").then((m) => m.GlassesApp), {
  ssr: false,
  loading: () => <div className="flex min-h-dvh items-center justify-center bg-black text-3xl text-yellow-300">Bril-modus laden…</div>,
});

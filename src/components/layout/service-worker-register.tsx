"use client";

import { SerwistProvider } from "@serwist/turbopack/react";

/**
 * Registers the Serwist service worker for the whole origin. Disabled during
 * `next dev` unless NEXT_PUBLIC_SW_DEV=true (avoids stale caches while coding).
 */
export function ServiceWorkerRegister() {
  const disable = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SW_DEV !== "true";
  return <SerwistProvider swUrl="/serwist/sw.js" disable={disable} options={{ scope: "/" }} reloadOnOnline={false} />;
}

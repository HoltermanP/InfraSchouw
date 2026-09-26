/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate, CacheableResponsePlugin } from "serwist";
import { runSync } from "@/lib/offline/sync-engine";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

export const PDOK_TILE_CACHE = "pdok-tiles";
export const FIELD_PAGES_CACHE = "field-pages";
const SYNC_TAG = "infraschouw-sync";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // PDOK background/aerial tiles: cache-first so pre-cached areas work offline.
    {
      matcher: ({ url }) => url.hostname === "service.pdok.nl" && /\/wmts\//.test(url.pathname),
      handler: new CacheFirst({
        cacheName: PDOK_TILE_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 30000, maxAgeSeconds: 60 * 60 * 24 * 90 }),
        ],
      }),
    },
    // The field app shell (client-rendered from IndexedDB) must open offline.
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.mode === "navigate" && (url.pathname === "/veld" || url.pathname.startsWith("/veld/")),
      handler: new NetworkFirst({
        cacheName: FIELD_PAGES_CACHE,
        networkTimeoutSeconds: 4,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
        matchOptions: { ignoreSearch: true },
      }),
    },
    // Field bootstrap data (templates, projects, stations) — network first, cached fallback.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname === "/api/field/bootstrap",
      handler: new NetworkFirst({ cacheName: "field-bootstrap", networkTimeoutSeconds: 5 }),
    },
    // Authorised media thumbnails: stale-while-revalidate.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/media/") && url.searchParams.get("v") === "thumb",
      handler: new StaleWhileRevalidate({
        cacheName: "media-thumbs",
        plugins: [new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

async function notifyClients(message: unknown) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage(message);
}

// Background Sync: flush the offline queue even when the app is closed.
self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag: string };
  if (syncEvent.tag !== SYNC_TAG) return;
  syncEvent.waitUntil(
    runSync({ origin: self.location.origin, reason: "background-sync" })
      .then((result) => notifyClients({ type: "sync-complete", result }))
      .catch((err: unknown) => notifyClients({ type: "sync-error", message: String(err) })),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === "run-sync") {
    event.waitUntil(
      runSync({ origin: self.location.origin, reason: "message" })
        .then((result) => notifyClients({ type: "sync-complete", result }))
        .catch((err: unknown) => notifyClients({ type: "sync-error", message: String(err) })),
    );
  }
});

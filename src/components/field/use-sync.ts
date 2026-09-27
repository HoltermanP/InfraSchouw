"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/offline/db";
import { runSync, type SyncRunResult } from "@/lib/offline/sync-engine";

/**
 * Runs the sync engine on: app start, coming online, app focus, explicit
 * requests (after each capture) and every 30 s. The service worker's
 * Background Sync covers the case where the app is closed.
 */
export function useSync() {
  const [running, setRunning] = useState(false);
  const [online, setOnline] = useState(true);
  const [last, setLast] = useState<SyncRunResult | null>(null);
  const busy = useRef(false);

  const pending = useLiveQuery(() => getLocalDb().ops.where("status").anyOf("pending", "processing").count(), [], 0);
  const failed = useLiveQuery(() => getLocalDb().ops.where("status").equals("error").count(), [], 0);
  // Why the oldest waiting op has not gone through yet (e.g. a failing upload); shown on the sync indicator.
  const lastError = useLiveQuery(async () => (await getLocalDb().ops.where("status").anyOf("pending", "error").sortBy("seq")).find((o) => o.error)?.error ?? null, [], null);
  const lastSyncAt = useLiveQuery(async () => (await getLocalDb().kv.get("lastSyncAt"))?.value as string | undefined, [], undefined);

  const sync = useCallback(async (reason = "manual") => {
    if (busy.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    busy.current = true;
    setRunning(true);
    try {
      const res = await runSync({ origin: window.location.origin, reason });
      if (res.status !== "busy") setLast(res);
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void sync("online");
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void sync("focus");
    const onRequest = () => setTimeout(() => void sync("request"), 300);
    const onVisibility = () => document.visibilityState === "visible" && void sync("visible");
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "sync-complete") setLast((e.data as { result: SyncRunResult }).result);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("infraschouw:sync-requested", onRequest);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    const timer = setInterval(() => void sync("interval"), 30_000);
    void sync("start");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("infraschouw:sync-requested", onRequest);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [sync]);

  const retryFailed = useCallback(async () => {
    await getLocalDb().ops.where("status").equals("error").modify({ status: "pending", nextAttemptAt: 0, attempts: 0, permanent: false });
    await sync("retry");
  }, [sync]);

  return { running, online, pending: pending ?? 0, failed: failed ?? 0, lastError: lastError ?? null, lastSyncAt, last, sync, retryFailed };
}

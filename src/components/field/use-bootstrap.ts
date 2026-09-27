"use client";

import { useCallback, useEffect, useState } from "react";
import { getLocalDb } from "@/lib/offline/db";
import type { ChecklistAnswerType, Role } from "@/lib/domain";

export type FieldTemplate = {
  id: string;
  key: string;
  name: string;
  description: string;
  phase: string;
  isStation: boolean;
  isBilling: boolean;
  tracksRoute: boolean;
  checklist: { id: string; question: string; answerType: ChecklistAnswerType; options: string[]; photoRequired: boolean; required: boolean }[];
  shots: { id: string; groupName: string; title: string; description: string; required: boolean; stationComponent: string | null }[];
};

export type Bootstrap = {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; field: { gpsIntervalSeconds: number; maxVideoSeconds: number; keyframeIntervalSeconds: number; accuracyWarningMeters: number } };
  role: Role;
  storage: { mode: "blob" | "local"; prefix: string };
  templates: FieldTemplate[];
  projects: { id: string; number: string; name: string; areaGeojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null }[];
  stations: { id: string; code: string; name: string; projectId: string | null; lat: number | null; lon: number | null; address: string | null }[];
  serverTime: string;
};

/**
 * Field-app bootstrap data: fetched when online and cached in IndexedDB so
 * the app starts without a network connection.
 */
export function useBootstrap() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "offline-cache" | "unauthorized" | "error">("loading");

  const load = useCallback(async () => {
    const db = getLocalDb();
    const cached = (await db.kv.get("bootstrap"))?.value as Bootstrap | undefined;
    if (cached) {
      setData(cached);
      setState("offline-cache");
    }
    try {
      const res = await fetch("/api/field/bootstrap", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        setState(cached ? "offline-cache" : "unauthorized");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const fresh = (await res.json()) as Bootstrap;
      await db.kv.put({ key: "bootstrap", value: fresh, updatedAt: Date.now() });
      setData(fresh);
      setState("ready");
    } catch {
      setState(cached ? "offline-cache" : "error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { data, state, reload: load };
}

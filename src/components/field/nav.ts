"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Field-app navigation via the History API (no server round-trip), so moving
 * between screens also works offline. State lives in the query string:
 *   /veld                     → home
 *   /veld?nieuw=1&project=…   → new inspection
 *   /veld?schouw=<id>         → capture screen
 *   /veld?schouw=<id>&stap=afronden → finish
 */
export type FieldRoute = { view: "home" } | { view: "new"; projectId: string | null; stationId: string | null } | { view: "inspection"; id: string; step: "vastleggen" | "afronden" };

function parse(search: string): FieldRoute {
  const p = new URLSearchParams(search);
  const id = p.get("schouw");
  if (id) return { view: "inspection", id, step: p.get("stap") === "afronden" ? "afronden" : "vastleggen" };
  if (p.get("nieuw")) return { view: "new", projectId: p.get("project"), stationId: p.get("station") };
  return { view: "home" };
}

export function toSearch(route: FieldRoute): string {
  if (route.view === "home") return "";
  if (route.view === "new") {
    const p = new URLSearchParams({ nieuw: "1" });
    if (route.projectId) p.set("project", route.projectId);
    if (route.stationId) p.set("station", route.stationId);
    return `?${p}`;
  }
  const p = new URLSearchParams({ schouw: route.id });
  if (route.step === "afronden") p.set("stap", "afronden");
  return `?${p}`;
}

export function useFieldRoute() {
  const [route, setRoute] = useState<FieldRoute>({ view: "home" });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoute(parse(window.location.search));
    const onPop = () => setRoute(parse(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((next: FieldRoute, replace = false) => {
    const url = `${window.location.pathname}${toSearch(next)}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);
  return { route, go };
}

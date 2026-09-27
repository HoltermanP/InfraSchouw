"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, Cloud, RefreshCw, AlertTriangle, Plus, LayoutDashboard, Glasses, ChevronRight, Map as MapIcon } from "lucide-react";
import { getLocalDb } from "@/lib/offline/db";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBootstrap, type Bootstrap } from "./use-bootstrap";
import { useSync } from "./use-sync";
import { useFieldRoute, type FieldRoute } from "./nav";
import { NewInspection } from "./new-inspection";
import { InspectionScreen } from "./inspection-screen";
import { FinishScreen } from "./finish-screen";
import { OfflineAreaButton } from "./offline-area";

export type SyncState = ReturnType<typeof useSync>;

export function SyncIndicator({ sync, compact = false }: { sync: SyncState; compact?: boolean }) {
  const Icon = !sync.online ? CloudOff : sync.failed ? AlertTriangle : sync.running ? RefreshCw : Cloud;
  const label = !sync.online
    ? `Offline — ${sync.pending} wachtend`
    : sync.failed
      ? `${sync.failed} mislukt`
      : sync.pending
        ? `${sync.pending} wachtend${sync.lastError ? " · probleem" : ""}`
        : "Gesynchroniseerd";
  return (
    <button
      type="button"
      onClick={() => (sync.failed ? sync.retryFailed() : sync.sync("manual"))}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        !sync.online ? "bg-neutral-600 text-white" : sync.failed ? "bg-red-600 text-white" : sync.pending ? "bg-amber-400 text-black" : "bg-emerald-600 text-white",
      )}
      data-testid="sync-indicator"
      data-pending={sync.pending}
      data-online={sync.online}
      title={sync.lastError ?? (sync.lastSyncAt ? `Laatste sync ${fmtDateTime(sync.lastSyncAt)}` : "Nog niet gesynchroniseerd")}
    >
      <Icon className={cn("size-4", sync.running && "animate-spin")} aria-hidden />
      {compact ? sync.pending || "" : label}
    </button>
  );
}

function Home({ data, sync, go }: { data: Bootstrap; sync: SyncState; go: (r: FieldRoute) => void }) {
  const inspections = useLiveQuery(
    () => getLocalDb().inspections.where("userId").equals(data.user.id).reverse().sortBy("updatedAt"),
    [data.user.id],
  );
  const templates = new Map(data.templates.map((t) => [t.id, t.name]));
  const running = (inspections ?? []).filter((i) => i.status === "lopend");
  const done = (inspections ?? []).filter((i) => i.status !== "lopend").slice(0, 20);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4">
      <button
        type="button"
        onClick={() => go({ view: "new", projectId: null, stationId: null })}
        className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-amber-400 text-xl font-bold text-black shadow-lg active:scale-[0.99]"
        data-testid="new-inspection"
      >
        <Plus className="size-7" /> Nieuwe schouw
      </button>

      {running.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/70 uppercase">Lopende schouwen</h2>
          <ul className="flex flex-col gap-2">
            {running.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => go({ view: "inspection", id: i.id, step: "vastleggen" })}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/10 p-4 text-left"
                >
                  <span className="size-3 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.title}</span>
                    <span className="block text-xs text-white/60">
                      {templates.get(i.templateId) ?? "Schouw"} · gestart {fmtRelative(i.startedAt)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-white/50" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/70 uppercase">Recent afgerond op dit apparaat</h2>
        {done.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 p-4 text-sm text-white/60">Nog geen afgeronde schouwen op dit apparaat.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {done.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="truncate">{i.title}</span>
                <a href={`/schouwen/${i.id}`} className="shrink-0 text-xs text-amber-300 underline">
                  Bekijk verslag
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-white/5 p-4 text-sm">
        <h2 className="font-semibold">Offline werken</h2>
        <p className="text-white/70">
          Alles wat je vastlegt wordt eerst op dit apparaat bewaard en automatisch gesynchroniseerd zodra er verbinding is.
          {sync.lastSyncAt ? ` Laatste synchronisatie: ${fmtDateTime(sync.lastSyncAt)}.` : ""}
        </p>
        <OfflineAreaButton projects={data.projects} />
      </section>
    </div>
  );
}

export function FieldApp() {
  const { data, state } = useBootstrap();
  const sync = useSync();
  const { route, go } = useFieldRoute();

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950/95 px-4 py-3 backdrop-blur">
        <button type="button" onClick={() => go({ view: "home" })} className="text-lg font-bold">
          Infra<span className="text-amber-400">Schouw</span> <span className="text-xs font-normal text-white/60">veld</span>
        </button>
        <div className="flex items-center gap-2">
          <SyncIndicator sync={sync} />
          <Link href="/veld/bril" className="rounded-full bg-white/10 p-2" aria-label="Bril-modus" title="Bril-modus (spraakgestuurd)">
            <Glasses className="size-4" />
          </Link>
          <a href="/dashboard" className="rounded-full bg-white/10 p-2" aria-label="Naar backend" title="Naar backend">
            <LayoutDashboard className="size-4" />
          </a>
        </div>
      </header>
      {state === "loading" && !data ? (
        <p className="p-6 text-center text-white/70">Laden…</p>
      ) : !data ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-10 text-amber-400" />
          <p>
            {state === "unauthorized"
              ? "Je bent niet ingelogd. Log in om de veld-app te gebruiken."
              : "Geen verbinding en nog geen gegevens op dit apparaat. Open de veld-app één keer online."}
          </p>
          <a href="/demo-login?terug=/veld" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">
            Inloggen
          </a>
        </div>
      ) : route.view === "home" ? (
        <Home data={data} sync={sync} go={go} />
      ) : route.view === "new" ? (
        <NewInspection data={data} initialProjectId={route.projectId} initialStationId={route.stationId} go={go} />
      ) : route.step === "afronden" ? (
        <FinishScreen data={data} inspectionId={route.id} go={go} />
      ) : (
        <InspectionScreen data={data} inspectionId={route.id} go={go} sync={sync} />
      )}
      {state === "offline-cache" && data ? (
        <p className="pointer-events-none fixed bottom-1 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-800/90 px-3 py-1 text-[11px] text-white/70">
          <MapIcon className="mr-1 inline size-3" /> Offline-modus: gegevens uit de cache van dit apparaat
        </p>
      ) : null}
    </div>
  );
}

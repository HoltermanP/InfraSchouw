"use client";

import { useState } from "react";
import { Plus, Trash2, Save, ClipboardCheck, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AsbuiltBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { applyNameplate, updateStationField } from "@/app/(app)/stations/actions";
import { runAsbuilt } from "@/app/(app)/schouwen/actions";
import type { StationDescription } from "@/lib/station/schema";
import type { FieldMeta } from "@/lib/station/types";
import type { AsbuiltRow } from "@/lib/station/asbuilt";
import { cn } from "@/lib/utils";

type Photo = { id: string; seq: number | null; thumb: string | null };

function SourceBadge({ meta }: { meta: FieldMeta | undefined }) {
  if (!meta) return null;
  if (meta.source === "ai")
    return (
      <span className="rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-800" title="AI-voorstel">
        AI{meta.confidence !== null ? ` ${Math.round(meta.confidence * 100)}%` : ""}
      </span>
    );
  if (meta.source === "handmatig") return <span className="rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-800">Handmatig</span>;
  return <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-800">Geïmporteerd</span>;
}

function useFieldSaver(inspectionId: string, canEdit: boolean) {
  const { run } = useAction();
  return (path: string, value: unknown) => {
    if (!canEdit) return;
    void run(() => updateStationField(inspectionId, path, value), { success: "Opgeslagen" });
  };
}

function TextField({ label, path, value, meta, save, canEdit, numeric = false, options }: { label: string; path: string; value: string | number | null; meta: Record<string, FieldMeta>; save: (p: string, v: unknown) => void; canEdit: boolean; numeric?: boolean; options?: string[] }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  const commit = (next: string) => {
    const parsed = next.trim() === "" ? null : numeric ? Number(next.replace(",", ".")) : next;
    if (String(parsed ?? "") !== String(value ?? "")) save(path, parsed);
  };
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} <SourceBadge meta={meta[path]} />
      </span>
      {options ? (
        <NativeSelect value={v} disabled={!canEdit} onChange={(e) => {
          setV(e.target.value);
          commit(e.target.value);
        }} aria-label={label}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input value={v} readOnly={!canEdit} inputMode={numeric ? "decimal" : undefined} onChange={(e) => setV(e.target.value)} onBlur={(e) => commit(e.target.value)} aria-label={label} className={cn(meta[path]?.source === "ai" && "border-violet-300")} />
      )}
    </label>
  );
}

function ListField({ label, path, value, meta, save, canEdit }: { label: string; path: string; value: string[]; meta: Record<string, FieldMeta>; save: (p: string, v: unknown) => void; canEdit: boolean }) {
  const [v, setV] = useState(value.join("; "));
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} (gescheiden door ;) <SourceBadge meta={meta[path]} />
      </span>
      <Input
        value={v}
        readOnly={!canEdit}
        onChange={(e) => setV(e.target.value)}
        onBlur={(e) => {
          const arr = e.target.value.split(";").map((s) => s.trim()).filter(Boolean);
          if (arr.join(";") !== value.join(";")) save(path, arr);
        }}
        aria-label={label}
      />
    </label>
  );
}

function RowsEditor<T extends Record<string, unknown>>({
  title,
  path,
  rows,
  columns,
  empty,
  meta,
  save,
  canEdit,
}: {
  title: string;
  path: string;
  rows: T[];
  columns: { key: keyof T & string; label: string; type?: "number" | "bool" | "select"; options?: string[] }[];
  empty: T;
  meta: Record<string, FieldMeta>;
  save: (p: string, v: unknown) => void;
  canEdit: boolean;
}) {
  const [data, setData] = useState<T[]>(rows);
  const [dirty, setDirty] = useState(false);
  const locked = meta[path]?.source === "handmatig";
  const upd = (i: number, key: string, raw: string | boolean) => {
    const col = columns.find((c) => c.key === key)!;
    const value = col.type === "number" ? (raw === "" ? null : Number(String(raw).replace(",", "."))) : col.type === "bool" ? raw : raw === "" ? null : raw;
    setData((d) => d.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setDirty(true);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {locked ? <SourceBadge meta={meta[path]} /> : rows.length ? <SourceBadge meta={meta[`${path}.0.${columns[0]!.key}`]} /> : null}
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium">
                  {c.label}
                </th>
              ))}
              {canEdit ? <th className="w-8" /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className="border-t">
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-0.5">
                    {c.type === "bool" ? (
                      <input type="checkbox" checked={Boolean(r[c.key])} disabled={!canEdit} onChange={(e) => upd(i, c.key, e.target.checked)} aria-label={c.label} />
                    ) : c.type === "select" ? (
                      <select className="w-full bg-transparent" value={String(r[c.key] ?? "")} disabled={!canEdit} onChange={(e) => upd(i, c.key, e.target.value)} aria-label={c.label}>
                        <option value="">—</option>
                        {c.options!.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className="w-full bg-transparent px-1 outline-none focus:bg-muted" value={r[c.key] === null || r[c.key] === undefined ? "" : String(r[c.key])} readOnly={!canEdit} onChange={(e) => upd(i, c.key, e.target.value)} aria-label={c.label} />
                    )}
                  </td>
                ))}
                {canEdit ? (
                  <td>
                    <button type="button" aria-label="Rij verwijderen" onClick={() => {
                      setData((d) => d.filter((_, j) => j !== i));
                      setDirty(true);
                    }}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <Button size="xs" variant="outline" onClick={() => {
            setData((d) => [...d, { ...empty }]);
            setDirty(true);
          }}>
            <Plus /> Rij
          </Button>
          <Button size="xs" disabled={!dirty} onClick={() => {
            save(path, data);
            setDirty(false);
          }}>
            <Save /> Tabel opslaan
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function StationDescriptionEditor({
  inspectionId,
  values,
  meta,
  asbuilt,
  hasExpected,
  photos,
  nameplates,
  shotCoverage,
  canEdit,
}: {
  inspectionId: string;
  values: StationDescription;
  meta: Record<string, FieldMeta>;
  asbuilt: AsbuiltRow[];
  hasExpected: boolean;
  photos: Photo[];
  nameplates: { captureId: string; seq: number | null; thumb: string | null; caption: string; plate: Record<string, string | number | null> }[];
  shotCoverage: { title: string; group: string; done: number; required: boolean }[];
  canEdit: boolean;
}) {
  const save = useFieldSaver(inspectionId, canEdit);
  const { run, pending } = useAction();
  const f = (label: string, path: string, value: string | number | null, extra: { numeric?: boolean; options?: string[] } = {}) => (
    <TextField key={path} label={label} path={path} value={value} meta={meta} save={save} canEdit={canEdit} {...extra} />
  );
  const photoBySeq = new Map(photos.map((p) => [p.id, p]));
  const missingShots = shotCoverage.filter((s) => s.required && !s.done);
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border p-4">
        <h3 className="mb-2 font-semibold">Begeleide shotlist</h3>
        <p className="mb-2 text-sm text-muted-foreground">
          {shotCoverage.filter((s) => s.done).length} van {shotCoverage.length} shots vastgelegd{missingShots.length ? ` · ${missingShots.length} verplicht ontbreken` : ""}.
        </p>
        <ul className="grid gap-1 text-xs md:grid-cols-2">
          {shotCoverage.map((s) => (
            <li key={s.title} className={cn("flex justify-between rounded px-2 py-1", s.done ? "bg-emerald-50 dark:bg-emerald-950/20" : s.required ? "bg-red-50 dark:bg-red-950/20" : "bg-muted")}>
              <span>
                {s.group}: {s.title}
              </span>
              <span>{s.done ? `${s.done} foto` : s.required ? "ontbreekt" : "optioneel"}</span>
            </li>
          ))}
        </ul>
      </section>

      {nameplates.length ? (
        <section className="rounded-lg border p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <ScanText className="size-4" /> Herkende typeplaten (AI/OCR)
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {nameplates.map((n) => (
              <li key={n.captureId} className="flex gap-3 rounded border p-2 text-sm" data-testid="nameplate">
                {n.thumb ? <img src={n.thumb} alt="" className="size-20 rounded object-cover" /> : null}
                <div className="flex-1">
                  <p className="font-medium">Foto {n.seq}</p>
                  <p className="text-xs">
                    {Object.entries(n.plate)
                      .filter(([, v]) => v !== null)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                  {canEdit ? (
                    <div className="mt-1 flex gap-1">
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => applyNameplate(inspectionId, n.captureId, "mv"))}>
                        Overnemen als MS-installatie
                      </Button>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => applyNameplate(inspectionId, n.captureId, "trafo"))}>
                        Overnemen als transformator
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Buitenkant</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {f("Type", "exterior.type", values.exterior.type)}
          {f("Behuizing", "exterior.behuizing", values.exterior.behuizing)}
          {f("Staat", "exterior.staat", values.exterior.staat)}
          {f("Bereikbaarheid", "exterior.bereikbaarheid", values.exterior.bereikbaarheid)}
          {f("Opmerkingen", "exterior.opmerkingen", values.exterior.opmerkingen)}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">MS-installatie</h3>
        <div className="grid gap-3 md:grid-cols-4">
          {f("Fabrikant", "mv_switchgear.fabrikant", values.mv_switchgear.fabrikant)}
          {f("Type", "mv_switchgear.type", values.mv_switchgear.type)}
          {f("Bouwjaar", "mv_switchgear.bouwjaar", values.mv_switchgear.bouwjaar, { numeric: true })}
          {f("Serienummer", "mv_switchgear.serienummer", values.mv_switchgear.serienummer)}
          {f("Nominale spanning (kV)", "mv_switchgear.nominale_spanning_kv", values.mv_switchgear.nominale_spanning_kv, { numeric: true })}
          {f("Isolatiemedium", "mv_switchgear.isolatiemedium", values.mv_switchgear.isolatiemedium, { options: ["SF6", "lucht", "vast", "olie"] })}
          {f("Aantal velden", "mv_switchgear.aantal_velden", values.mv_switchgear.aantal_velden, { numeric: true })}
        </div>
        <RowsEditor
          title="Velden"
          path="mv_switchgear.velden"
          rows={values.mv_switchgear.velden as unknown as Record<string, unknown>[]}
          meta={meta}
          save={save}
          canEdit={canEdit}
          empty={{ positie: null, functie: null, aanduiding: null, beveiliging: null, kabel_aangesloten: null, capture_ids: [] }}
          columns={[
            { key: "positie", label: "Positie" },
            { key: "functie", label: "Functie", type: "select", options: ["kabel", "trafo", "koppel", "meet", "reserve"] },
            { key: "aanduiding", label: "Aanduiding" },
            { key: "beveiliging", label: "Beveiliging" },
            { key: "kabel_aangesloten", label: "Kabel", type: "bool" },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <RowsEditor
          title="Transformator(en)"
          path="transformers"
          rows={values.transformers as unknown as Record<string, unknown>[]}
          meta={meta}
          save={save}
          canEdit={canEdit}
          empty={{ fabrikant: null, type: null, vermogen_kva: null, primair_kv: null, secundair_v: null, schakelgroep: null, koeling: null, bouwjaar: null, serienummer: null, capture_ids: [] }}
          columns={[
            { key: "fabrikant", label: "Fabrikant" },
            { key: "type", label: "Type" },
            { key: "vermogen_kva", label: "kVA", type: "number" },
            { key: "primair_kv", label: "Prim. kV", type: "number" },
            { key: "secundair_v", label: "Sec. V", type: "number" },
            { key: "schakelgroep", label: "Schakelgroep" },
            { key: "koeling", label: "Koeling" },
            { key: "bouwjaar", label: "Bouwjaar", type: "number" },
            { key: "serienummer", label: "Serienr." },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">LS-verdeler</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {f("Type", "lv_board.type", values.lv_board.type)}
          {f("Aantal groepen", "lv_board.aantal_groepen", values.lv_board.aantal_groepen, { numeric: true })}
        </div>
        <RowsEditor
          title="LS-groepen"
          path="lv_board.groepen"
          rows={values.lv_board.groepen as unknown as Record<string, unknown>[]}
          meta={meta}
          save={save}
          canEdit={canEdit}
          empty={{ nr: null, zekering_a: null, aanduiding: null }}
          columns={[
            { key: "nr", label: "Groep" },
            { key: "zekering_a", label: "Zekering (A)", type: "number" },
            { key: "aanduiding", label: "Aanduiding" },
          ]}
        />
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <ListField label="MS-eindsluitingen" path="cables.mv_eindsluitingen" value={values.cables.mv_eindsluitingen} meta={meta} save={save} canEdit={canEdit} />
        <ListField label="LS-kabels" path="cables.lv_kabels" value={values.cables.lv_kabels} meta={meta} save={save} canEdit={canEdit} />
        {f("Kabelinvoer / afdichting", "cables.invoer_afdichting", values.cables.invoer_afdichting)}
        {f("Aarding", "earthing.beschrijving", values.earthing.beschrijving)}
        {f("RTU / distributieautomatisering", "automation.rtu", values.automation.rtu)}
        {f("Meters", "automation.meters", values.automation.meters)}
        {f("Communicatie", "automation.communicatie", values.automation.communicatie)}
        <ListField label="Veiligheid aanwezig" path="safety.aanwezig" value={values.safety.aanwezig} meta={meta} save={save} canEdit={canEdit} />
        <ListField label="Veiligheid ontbrekend" path="safety.ontbrekend" value={values.safety.ontbrekend} meta={meta} save={save} canEdit={canEdit} />
        {f("Algemene staat", "overall_condition", values.overall_condition, { options: ["goed", "redelijk", "matig", "slecht"] })}
        {f("Opmerkingen", "remarks", values.remarks)}
      </section>

      <section className="flex flex-col gap-3" data-testid="asbuilt">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">As-built-check</h3>
          {canEdit ? (
            <Button variant="outline" disabled={pending || !hasExpected} onClick={() => run(() => runAsbuilt(inspectionId))} data-testid="run-asbuilt">
              <ClipboardCheck /> As-built-check uitvoeren
            </Button>
          ) : null}
        </div>
        {!hasExpected ? <p className="text-sm text-muted-foreground">Leg eerst de verwachte configuratie vast op de stationspagina.</p> : null}
        {asbuilt.length ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="px-2 py-1 text-left">Kenmerk</th>
                  <th className="px-2 py-1 text-left">Verwacht</th>
                  <th className="px-2 py-1 text-left">Aangetroffen</th>
                  <th className="px-2 py-1 text-left">Resultaat</th>
                  <th className="px-2 py-1 text-left">Bewijs</th>
                </tr>
              </thead>
              <tbody>
                {asbuilt.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="px-2 py-1">{r.label}</td>
                    <td className="px-2 py-1">{r.expected ?? "—"}</td>
                    <td className="px-2 py-1">{r.found ?? "—"}</td>
                    <td className="px-2 py-1">
                      <AsbuiltBadge status={r.status} />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-1">
                        {r.captureIds.slice(0, 3).map((id) => {
                          const p = photoBySeq.get(id);
                          return p?.thumb ? <img key={id} src={p.thumb} alt={`Foto ${p.seq}`} title={`Foto ${p.seq}`} className="size-9 rounded object-cover" /> : null;
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasExpected ? (
          <p className="text-sm text-muted-foreground">Nog niet uitgevoerd.</p>
        ) : null}
        <p className="text-xs text-muted-foreground">Afwijkingen worden automatisch als bevinding (categorie contract of techniek) toegevoegd.</p>
      </section>
    </div>
  );
}

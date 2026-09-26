"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { saveStation, type StationInput } from "@/app/(app)/stations/actions";
import { STATION_HOUSINGS, STATION_HOUSING_LABELS, STATION_STATUSES, STATION_STATUS_LABELS, STATION_TYPES, STATION_TYPE_LABELS } from "@/lib/domain";
import { reverseGeocode } from "@/lib/geo/pdok";

export function StationForm({ id, initial, projects }: { id: string | null; initial?: Partial<StationInput>; projects: { id: string; number: string; name: string }[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [s, setS] = useState<StationInput>({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    address: initial?.address ?? null,
    lat: initial?.lat ?? null,
    lon: initial?.lon ?? null,
    owner: initial?.owner ?? null,
    stationType: initial?.stationType ?? "compact",
    housing: initial?.housing ?? "beton",
    buildYear: initial?.buildYear ?? null,
    status: initial?.status ?? "bestaand",
    projectId: initial?.projectId ?? null,
    notes: initial?.notes ?? null,
  });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <form
      className="grid max-w-3xl gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveStation(id, s), { onSuccess: (d) => !id && router.push(`/stations/${d.id}`) });
      }}
    >
      <Field label="Stationsnummer (netbeheerder-ID)" htmlFor="st-code">
        <Input id="st-code" required value={s.code} onChange={(e) => setS({ ...s, code: e.target.value })} />
      </Field>
      <Field label="Naam" htmlFor="st-name">
        <Input id="st-name" required value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </Field>
      <Field label="Type" htmlFor="st-type">
        <NativeSelect id="st-type" value={s.stationType} onChange={(e) => setS({ ...s, stationType: e.target.value as StationInput["stationType"] })}>
          {STATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {STATION_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Behuizing" htmlFor="st-housing">
        <NativeSelect id="st-housing" value={s.housing} onChange={(e) => setS({ ...s, housing: e.target.value as StationInput["housing"] })}>
          {STATION_HOUSINGS.map((t) => (
            <option key={t} value={t}>
              {STATION_HOUSING_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Status" htmlFor="st-status">
        <NativeSelect id="st-status" value={s.status} onChange={(e) => setS({ ...s, status: e.target.value as StationInput["status"] })}>
          {STATION_STATUSES.map((t) => (
            <option key={t} value={t}>
              {STATION_STATUS_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Bouwjaar" htmlFor="st-year">
        <Input id="st-year" inputMode="numeric" value={s.buildYear ?? ""} onChange={(e) => setS({ ...s, buildYear: num(e.target.value) })} />
      </Field>
      <Field label="Eigenaar (netbeheerder)" htmlFor="st-owner">
        <Input id="st-owner" value={s.owner ?? ""} onChange={(e) => setS({ ...s, owner: e.target.value || null })} />
      </Field>
      <Field label="Project" htmlFor="st-project">
        <NativeSelect id="st-project" value={s.projectId ?? ""} onChange={(e) => setS({ ...s, projectId: e.target.value || null })}>
          <option value="">Geen project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.number} – {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Latitude (WGS84)" htmlFor="st-lat">
        <Input id="st-lat" inputMode="decimal" value={s.lat ?? ""} onChange={(e) => setS({ ...s, lat: num(e.target.value) })} />
      </Field>
      <Field label="Longitude (WGS84)" htmlFor="st-lon">
        <Input id="st-lon" inputMode="decimal" value={s.lon ?? ""} onChange={(e) => setS({ ...s, lon: num(e.target.value) })} />
      </Field>
      <Field label="Adres" htmlFor="st-address" className="md:col-span-2">
        <div className="flex gap-2">
          <Input id="st-address" value={s.address ?? ""} onChange={(e) => setS({ ...s, address: e.target.value || null })} />
          <Button
            type="button"
            variant="outline"
            disabled={s.lat === null || s.lon === null}
            onClick={async () => {
              const r = await reverseGeocode(s.lat!, s.lon!);
              if (r) setS((cur) => ({ ...cur, address: r.address }));
            }}
          >
            Adres uit PDOK
          </Button>
        </div>
      </Field>
      <Field label="Opmerkingen" htmlFor="st-notes" className="md:col-span-2">
        <Textarea id="st-notes" rows={2} value={s.notes ?? ""} onChange={(e) => setS({ ...s, notes: e.target.value || null })} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {id ? "Opslaan" : "Station aanmaken"}
        </Button>
      </div>
    </form>
  );
}

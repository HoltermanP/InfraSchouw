"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { createProject, updateProject } from "@/app/(app)/projecten/actions";
import {
  CONTRACT_FORMS,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ContractForm,
  type ProjectPhase,
  type ProjectStatus,
} from "@/lib/domain";

type Initial = {
  id?: string;
  number: string;
  name: string;
  client: string | null;
  contractForm: ContractForm;
  phase: ProjectPhase;
  status: ProjectStatus;
  description: string | null;
  areaGeojson: unknown;
};

export function ProjectForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [area, setArea] = useState(initial?.areaGeojson ? JSON.stringify(initial.areaGeojson) : "");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setArea(await file.text());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      number: String(fd.get("number") ?? ""),
      name: String(fd.get("name") ?? ""),
      client: String(fd.get("client") ?? "") || null,
      contractForm: fd.get("contractForm") as ContractForm,
      phase: fd.get("phase") as ProjectPhase,
      status: fd.get("status") as ProjectStatus,
      description: String(fd.get("description") ?? "") || null,
      areaGeojson: area.trim() ? area : null,
    };
    if (initial?.id) {
      await run(() => updateProject(initial.id!, input));
    } else {
      await run(() => createProject(input), { onSuccess: (d) => router.push(`/projecten/${d.id}`), refresh: false });
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4 md:grid-cols-2">
      <Field label="Projectnummer" htmlFor="number">
        <Input id="number" name="number" required defaultValue={initial?.number} placeholder="bijv. P-2026-014" />
      </Field>
      <Field label="Naam" htmlFor="name">
        <Input id="name" name="name" required defaultValue={initial?.name} placeholder="bijv. Netverzwaring Stadshagen" />
      </Field>
      <Field label="Opdrachtgever" htmlFor="client">
        <Input id="client" name="client" defaultValue={initial?.client ?? ""} placeholder="bijv. Enexis Netbeheer" />
      </Field>
      <Field label="Contractvorm" htmlFor="contractForm">
        <NativeSelect id="contractForm" name="contractForm" defaultValue={initial?.contractForm ?? "UAV-GC"}>
          {CONTRACT_FORMS.map((c) => (
            <option key={c} value={c}>
              {c === "anders" ? "Anders" : c}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Fase" htmlFor="phase">
        <NativeSelect id="phase" name="phase" defaultValue={initial?.phase ?? "ontwerp"}>
          {PROJECT_PHASES.map((p) => (
            <option key={p} value={p}>
              {PROJECT_PHASE_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Status" htmlFor="status">
        <NativeSelect id="status" name="status" defaultValue={initial?.status ?? "actief"}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Omschrijving" htmlFor="description" className="md:col-span-2">
        <Textarea id="description" name="description" rows={3} defaultValue={initial?.description ?? ""} />
      </Field>
      <Field
        label="Projectgebied (GeoJSON)"
        htmlFor="area"
        className="md:col-span-2"
        hint="Plak een GeoJSON-polygoon (WGS84) of upload een .geojson-bestand. Je kunt het gebied ook op de kaart tekenen op de projectpagina."
      >
        <Textarea id="area" rows={4} value={area} onChange={(e) => setArea(e.target.value)} className="font-mono text-xs" placeholder='{"type":"Polygon","coordinates":[[[6.08,52.51],...]]}' />
        <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" aria-label="GeoJSON-bestand uploaden" />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {initial?.id ? "Opslaan" : "Project aanmaken"}
        </Button>
      </div>
    </form>
  );
}

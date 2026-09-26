"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { saveExpectedConfig } from "@/app/(app)/stations/actions";
import { parseExpectedConfig } from "@/lib/station/expected-import";
import type { ExpectedStationConfig } from "@/lib/station/types";

const TEXT_FIELDS: [keyof ExpectedStationConfig, string][] = [
  ["stationstype", "Stationstype"],
  ["behuizing", "Behuizing"],
  ["rmu_fabrikant", "Fabrikant MS-installatie"],
  ["rmu_type", "Type MS-installatie (RMU)"],
  ["isolatiemedium", "Isolatiemedium"],
  ["trafo_fabrikant", "Fabrikant transformator"],
];
const NUM_FIELDS: [keyof ExpectedStationConfig, string][] = [
  ["aantal_velden", "Aantal MS-velden"],
  ["trafo_aantal", "Aantal transformatoren"],
  ["trafo_vermogen_kva", "Vermogen transformator (kVA)"],
  ["ls_aantal_groepen", "Aantal LS-groepen"],
  ["aantal_mv_eindsluitingen", "Aantal MS-eindsluitingen"],
];

export function ExpectedConfigEditor({ stationId, initial, canEdit }: { stationId: string; initial: ExpectedStationConfig | null; canEdit: boolean }) {
  const { run, pending } = useAction();
  const [c, setC] = useState<Partial<ExpectedStationConfig>>(initial ?? {});
  const set = (k: keyof ExpectedStationConfig, v: unknown) => setC((cur) => ({ ...cur, [k]: v }));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {TEXT_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`ec-${k}`}>
            <Input id={`ec-${k}`} value={(c[k] as string | null) ?? ""} disabled={!canEdit} onChange={(e) => set(k, e.target.value || null)} />
          </Field>
        ))}
        {NUM_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`ec-${k}`}>
            <Input id={`ec-${k}`} inputMode="numeric" value={(c[k] as number | null) ?? ""} disabled={!canEdit} onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
        ))}
        <Field label="Veldfuncties (in volgorde)" htmlFor="ec-velden" hint="Bijv. kabel, kabel, kabel, trafo">
          <Input
            id="ec-velden"
            value={(c.velden_functies ?? []).join(", ")}
            disabled={!canEdit}
            onChange={(e) => set("velden_functies", e.target.value.split(/[,|]/).map((x) => x.trim()).filter(Boolean))}
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={Boolean(c.rtu_aanwezig)} disabled={!canEdit} onCheckedChange={(v) => set("rtu_aanwezig", Boolean(v))} />
          RTU / distributieautomatisering verwacht
        </label>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => saveExpectedConfig(stationId, c, "handmatig"))}>
            Opslaan
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
            <Upload className="size-4" /> Importeer CSV/JSON
            <input
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const parsed = parseExpectedConfig(await f.text());
                  setC(parsed as Partial<ExpectedStationConfig>);
                  await run(() => saveExpectedConfig(stationId, parsed, "import"));
                } catch (err) {
                  toast.error(`Import mislukt: ${(err as Error).message.slice(0, 200)}`);
                }
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

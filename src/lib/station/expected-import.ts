import { expectedStationConfigSchema, type ExpectedStationConfigInput } from "./schema";

const NUMERIC = new Set(["aantal_velden", "trafo_aantal", "trafo_vermogen_kva", "ls_aantal_groepen", "aantal_mv_eindsluitingen"]);
const ALIASES: Record<string, string> = {
  type: "stationstype",
  station_type: "stationstype",
  rmu: "rmu_type",
  ms_installatie: "rmu_type",
  fabrikant_rmu: "rmu_fabrikant",
  velden: "aantal_velden",
  veldfuncties: "velden_functies",
  trafo_kva: "trafo_vermogen_kva",
  vermogen: "trafo_vermogen_kva",
  ls_groepen: "ls_aantal_groepen",
  rtu: "rtu_aanwezig",
  eindsluitingen: "aantal_mv_eindsluitingen",
};

/** Parse an expected configuration from JSON or a "kenmerk;waarde" CSV (as exported from design tools). */
export function parseExpectedConfig(text: string): ExpectedStationConfigInput {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return expectedStationConfigSchema.parse(JSON.parse(trimmed));
  const out: Record<string, unknown> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim() || /^kenmerk[;,]/i.test(line)) continue;
    const [rawKey, ...rest] = line.split(/[;\t]|,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const key = ALIASES[rawKey!.trim().toLowerCase().replace(/\s+/g, "_")] ?? rawKey!.trim().toLowerCase().replace(/\s+/g, "_");
    const value = rest.join(";").trim().replace(/^"|"$/g, "");
    if (!value) continue;
    if (key === "velden_functies") out[key] = value.split(/[|/ ]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);
    else if (key === "rtu_aanwezig") out[key] = /^(ja|yes|true|1)$/i.test(value);
    else if (NUMERIC.has(key)) out[key] = Number(value.replace(",", "."));
    else out[key] = value;
  }
  return expectedStationConfigSchema.parse(out);
}

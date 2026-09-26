import type { AsbuiltStatus, FindingCategory } from "../domain";
import type { StationDescription } from "./schema";
import type { ExpectedStationConfig } from "./types";

export type AsbuiltRow = {
  key: string;
  label: string;
  expected: string | null;
  found: string | null;
  status: AsbuiltStatus;
  captureIds: string[];
  /** Category used when the deviation is turned into a finding. */
  category: FindingCategory;
  remark?: string | null;
};

function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

function textMatch(expected: string, found: string): boolean {
  const e = norm(expected);
  const f = norm(found);
  return e.length > 0 && f.length > 0 && (e === f || f.includes(e) || e.includes(f));
}

function fmtNum(v: number | null | undefined, unit = ""): string | null {
  return v === null || v === undefined ? null : `${v}${unit ? ` ${unit}` : ""}`;
}

type RowSpec = {
  key: string;
  label: string;
  category: FindingCategory;
  expected: string | number | boolean | string[] | null;
  found: string | number | boolean | string[] | null;
  captureIds: string[];
  compare: "text" | "number" | "boolean" | "multiset";
  unit?: string;
};

function display(v: RowSpec["expected"], unit?: string): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (typeof v === "boolean") return v ? "Ja" : "Nee";
  if (typeof v === "number") return fmtNum(v, unit);
  return v;
}

function evaluate(spec: RowSpec): AsbuiltStatus {
  const { expected, found } = spec;
  if (found === null || found === undefined || (Array.isArray(found) && found.length === 0)) return "niet_vastgesteld";
  switch (spec.compare) {
    case "text":
      return textMatch(String(expected), String(found)) ? "conform" : "afwijkend";
    case "number":
      return Math.abs(Number(expected) - Number(found)) < 1e-6 ? "conform" : "afwijkend";
    case "boolean":
      return Boolean(expected) === Boolean(found) ? "conform" : "afwijkend";
    case "multiset": {
      const a = [...(expected as string[])].map(norm).sort();
      const b = [...(found as string[])].map(norm).sort();
      return a.length === b.length && a.every((v, i) => v === b[i]) ? "conform" : "afwijkend";
    }
  }
}

/**
 * Compare the expected (design) configuration with what was found during the
 * inspection. Rows without an expected value are omitted.
 */
export function compareAsbuilt(expected: ExpectedStationConfig, found: StationDescription): AsbuiltRow[] {
  const mv = found.mv_switchgear;
  const tr = found.transformers;
  const fieldFunctions = mv.velden.map((v) => v.functie).filter((f): f is NonNullable<typeof f> => f !== null);
  const totalKva = tr.length ? tr.map((t) => t.vermogen_kva).filter((v): v is number => v !== null) : [];

  const specs: RowSpec[] = [
    {
      key: "stationstype",
      label: "Stationstype",
      category: "contract",
      expected: expected.stationstype,
      found: found.exterior.type,
      captureIds: found.exterior.capture_ids,
      compare: "text",
    },
    {
      key: "behuizing",
      label: "Behuizing",
      category: "contract",
      expected: expected.behuizing,
      found: found.exterior.behuizing,
      captureIds: found.exterior.capture_ids,
      compare: "text",
    },
    {
      key: "rmu_fabrikant",
      label: "Fabrikant MS-installatie",
      category: "contract",
      expected: expected.rmu_fabrikant,
      found: mv.fabrikant,
      captureIds: mv.capture_ids,
      compare: "text",
    },
    {
      key: "rmu_type",
      label: "Type MS-installatie (RMU)",
      category: "contract",
      expected: expected.rmu_type,
      found: mv.type,
      captureIds: mv.capture_ids,
      compare: "text",
    },
    {
      key: "aantal_velden",
      label: "Aantal MS-velden",
      category: "techniek",
      expected: expected.aantal_velden,
      found: mv.aantal_velden ?? (mv.velden.length || null),
      captureIds: mv.capture_ids,
      compare: "number",
    },
    {
      key: "velden_functies",
      label: "Veldfuncties",
      category: "techniek",
      expected: expected.velden_functies.length ? expected.velden_functies : null,
      found: fieldFunctions,
      captureIds: mv.velden.flatMap((v) => v.capture_ids),
      compare: "multiset",
    },
    {
      key: "isolatiemedium",
      label: "Isolatiemedium",
      category: "techniek",
      expected: expected.isolatiemedium,
      found: mv.isolatiemedium,
      captureIds: mv.capture_ids,
      compare: "text",
    },
    {
      key: "trafo_aantal",
      label: "Aantal transformatoren",
      category: "contract",
      expected: expected.trafo_aantal,
      found: tr.length || null,
      captureIds: tr.flatMap((t) => t.capture_ids),
      compare: "number",
    },
    {
      key: "trafo_vermogen_kva",
      label: "Vermogen transformator",
      category: "contract",
      expected: expected.trafo_vermogen_kva,
      found: totalKva.length ? totalKva[0]! : null,
      captureIds: tr.flatMap((t) => t.capture_ids),
      compare: "number",
      unit: "kVA",
    },
    {
      key: "trafo_fabrikant",
      label: "Fabrikant transformator",
      category: "contract",
      expected: expected.trafo_fabrikant,
      found: tr[0]?.fabrikant ?? null,
      captureIds: tr.flatMap((t) => t.capture_ids),
      compare: "text",
    },
    {
      key: "ls_aantal_groepen",
      label: "Aantal LS-groepen",
      category: "techniek",
      expected: expected.ls_aantal_groepen,
      found: found.lv_board.aantal_groepen ?? (found.lv_board.groepen.length || null),
      captureIds: found.lv_board.capture_ids,
      compare: "number",
    },
    {
      key: "rtu_aanwezig",
      label: "RTU / distributieautomatisering aanwezig",
      category: "techniek",
      expected: expected.rtu_aanwezig,
      found: found.automation.rtu === null ? null : !/^(geen|nee|n\.?v\.?t\.?)$/i.test(found.automation.rtu.trim()),
      captureIds: found.automation.capture_ids,
      compare: "boolean",
    },
    {
      key: "aantal_mv_eindsluitingen",
      label: "Aantal MS-eindsluitingen",
      category: "contract",
      expected: expected.aantal_mv_eindsluitingen,
      found: found.cables.mv_eindsluitingen.length || null,
      captureIds: found.cables.capture_ids,
      compare: "number",
    },
  ];

  return specs
    .filter((s) => s.expected !== null && s.expected !== undefined && !(Array.isArray(s.expected) && s.expected.length === 0))
    .map((s) => ({
      key: s.key,
      label: s.label,
      expected: display(s.expected, s.unit),
      found: display(s.found, s.unit),
      status: evaluate(s),
      captureIds: [...new Set(s.captureIds)],
      category: s.category,
    }));
}

export function asbuiltSummary(rows: AsbuiltRow[]) {
  return {
    conform: rows.filter((r) => r.status === "conform").length,
    afwijkend: rows.filter((r) => r.status === "afwijkend").length,
    nietVastgesteld: rows.filter((r) => r.status === "niet_vastgesteld").length,
  };
}

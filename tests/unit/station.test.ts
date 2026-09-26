import { describe, expect, it } from "vitest";
import { emptyStationDescription, stationDescriptionSchema, expectedStationConfigSchema } from "@/lib/station/schema";
import { applyManualEdit, collectCaptureIds, mergeAiDescription, pruneCaptureIds } from "@/lib/station/merge";
import { asbuiltSummary, compareAsbuilt } from "@/lib/station/asbuilt";

function aiDesc() {
  const d = emptyStationDescription();
  d.exterior.type = "Compact station";
  d.exterior.behuizing = "beton";
  d.mv_switchgear.fabrikant = "Eaton";
  d.mv_switchgear.type = "Xiria 3K+1T";
  d.mv_switchgear.aantal_velden = 4;
  d.mv_switchgear.capture_ids = ["c1"];
  d.mv_switchgear.velden = [
    { positie: "1", functie: "kabel", aanduiding: "Richting A", beveiliging: null, kabel_aangesloten: true, capture_ids: ["c2"] },
    { positie: "2", functie: "kabel", aanduiding: "Richting B", beveiliging: null, kabel_aangesloten: true, capture_ids: [] },
    { positie: "3", functie: "kabel", aanduiding: "Reserve", beveiliging: null, kabel_aangesloten: false, capture_ids: [] },
    { positie: "4", functie: "trafo", aanduiding: "Trafo", beveiliging: "Zekering 40A", kabel_aangesloten: true, capture_ids: [] },
  ];
  d.transformers = [
    { fabrikant: "SGB", type: "DOTE", vermogen_kva: 400, primair_kv: 10.5, secundair_v: 420, schakelgroep: "Dyn5", koeling: "ONAN", bouwjaar: 2026, serienummer: "X1", capture_ids: ["c3"] },
  ];
  d.cables.mv_eindsluitingen = ["a", "b", "c"];
  return stationDescriptionSchema.parse(d);
}

describe("station description merge", () => {
  it("fills an empty document and records AI provenance", () => {
    const doc = mergeAiDescription(null, aiDesc(), 0.8);
    expect(doc.values.mv_switchgear.fabrikant).toBe("Eaton");
    expect(doc.fieldMeta["mv_switchgear.fabrikant"]).toMatchObject({ source: "ai", confidence: 0.8 });
    expect(doc.fieldMeta["transformers.0.vermogen_kva"]?.source).toBe("ai");
  });

  it("never overwrites manual edits", () => {
    let doc = mergeAiDescription(null, aiDesc(), 0.8);
    doc = applyManualEdit(doc, "mv_switchgear.fabrikant", "ABB", "user-1");
    doc = applyManualEdit(doc, "transformers.0.vermogen_kva", 630, "user-1");
    const second = aiDesc();
    second.mv_switchgear.fabrikant = "Siemens";
    second.transformers[0]!.vermogen_kva = 250;
    second.mv_switchgear.type = "Xiria E";
    const merged = mergeAiDescription(doc, second, 0.9);
    expect(merged.values.mv_switchgear.fabrikant).toBe("ABB");
    expect(merged.values.transformers[0]!.vermogen_kva).toBe(630);
    expect(merged.values.mv_switchgear.type).toBe("Xiria E");
    expect(merged.fieldMeta["mv_switchgear.fabrikant"]?.source).toBe("handmatig");
  });

  it("keeps known values when a later AI run returns null", () => {
    const doc = mergeAiDescription(null, aiDesc(), 0.8);
    const next = aiDesc();
    next.mv_switchgear.serienummer = null;
    next.exterior.type = null;
    const merged = mergeAiDescription(doc, next, 0.7);
    expect(merged.values.exterior.type).toBe("Compact station");
  });

  it("locks a whole array after a manual structural edit", () => {
    let doc = mergeAiDescription(null, aiDesc(), 0.8);
    doc = applyManualEdit(doc, "mv_switchgear.velden", [doc.values.mv_switchgear.velden[0]], "u");
    const merged = mergeAiDescription(doc, aiDesc(), 0.9);
    expect(merged.values.mv_switchgear.velden).toHaveLength(1);
  });

  it("collects and prunes capture ids", () => {
    const d = aiDesc();
    expect(collectCaptureIds(d).sort()).toEqual(["c1", "c2", "c3"]);
    const { desc, removed } = pruneCaptureIds(d, new Set(["c1", "c3"]));
    expect(removed).toEqual(["c2"]);
    expect(collectCaptureIds(desc).sort()).toEqual(["c1", "c3"]);
  });
});

describe("as-built check", () => {
  it("marks conform, deviating and undetermined rows", () => {
    const expected = expectedStationConfigSchema.parse({
      rmu_fabrikant: "Eaton",
      rmu_type: "Xiria 3K+1T",
      aantal_velden: 4,
      velden_functies: ["kabel", "kabel", "kabel", "trafo"],
      trafo_aantal: 1,
      trafo_vermogen_kva: 630,
      ls_aantal_groepen: 8,
      aantal_mv_eindsluitingen: 3,
    });
    const rows = compareAsbuilt(expected, aiDesc());
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.rmu_fabrikant!.status).toBe("conform");
    expect(byKey.rmu_type!.status).toBe("conform");
    expect(byKey.velden_functies!.status).toBe("conform");
    expect(byKey.trafo_vermogen_kva!.status).toBe("afwijkend");
    expect(byKey.trafo_vermogen_kva!.found).toBe("400 kVA");
    expect(byKey.ls_aantal_groepen!.status).toBe("niet_vastgesteld");
    expect(byKey.aantal_mv_eindsluitingen!.status).toBe("conform");
    expect(byKey.trafo_vermogen_kva!.captureIds).toEqual(["c3"]);
    expect(rows.find((r) => r.key === "rtu_aanwezig")).toBeUndefined();
    expect(asbuiltSummary(rows)).toEqual({ conform: 6, afwijkend: 1, nietVastgesteld: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { buildBaselineReport, buildReportFromDraft, isSectionEdited, mergeGenerated, type BuildContext } from "@/lib/report/build";
import { getSections, paragraph, referencedCaptureIds, replaceSection, section, sectionByKey, sectionHash } from "@/lib/report/doc";
import { diffReports, diffWords } from "@/lib/report/diff";
import type { ReportDraft } from "@/lib/ai/schemas";

const ctx: BuildContext = {
  inspection: { title: "Test", startedAt: new Date("2026-09-01T10:00:00Z"), endedAt: null, address: "Straat 1, Zwolle", weather: null },
  template: {
    name: "Tracéschouw",
    purposeText: "Doel van de schouw.",
    isStation: false,
    isBilling: false,
    sections: [
      { key: "samenvatting", title: "Samenvatting" },
      { key: "doel_scope", title: "Doel en scope" },
      { key: "bevindingen", title: "Bevindingen" },
      { key: "station", title: "Stationsbeschrijving" },
      { key: "bijlagen", title: "Bijlagen" },
    ],
  },
  project: null,
  station: null,
  captures: [
    { id: "c1", type: "photo", seq: 1, hiddenInReport: false, capturedAt: new Date(), note: null, analysis: { caption: "Sleuf" }, shotId: null },
    { id: "c2", type: "photo", seq: 2, hiddenInReport: false, capturedAt: new Date(), note: "Boom", analysis: null, shotId: null },
    { id: "c3", type: "photo", seq: 3, hiddenInReport: true, capturedAt: new Date(), note: null, analysis: null, shotId: null },
  ],
  findings: [{ id: "f1", title: "Kabel te ondiep", category: "kwaliteit", priority: "hoog", captureIds: ["c1"], lat: null, lon: null, description: "…" }],
  org: { settings: { export: { findingsGrouping: "thema" } } },
  billingItems: [],
};

const draft: ReportDraft = {
  title: "Verslag",
  summary: "AI-samenvatting.",
  key_points: [{ title: "Diepte", description: "Te ondiep", priority: "hoog", category: "kwaliteit", finding_ids: ["0"], capture_ids: ["c1", "bestaat-niet"] }],
  sections: [{ key: "bevindingen", title: "Bevindingen", blocks: [{ type: "paragraph", text: "Tekst." }, { type: "photo", capture_id: "c2", caption: "Boom", explanation: "Boom staat binnen de kroonprojectie." }, { type: "finding_ref", finding_index: 0 }] }],
  findings: [],
  actions: [],
  station: null,
  quantities: null,
  open_questions: ["Vraag?"],
};

describe("report building", () => {
  it("baseline report places finding photos and the rest, skips hidden photos and station section", () => {
    const { content, meta } = buildBaselineReport(ctx);
    expect(getSections(content).map((s) => s.attrs?.key)).toEqual(["samenvatting", "doel_scope", "bevindingen", "bijlagen"]);
    const ids = referencedCaptureIds(sectionByKey(content, "bevindingen")!);
    expect(ids).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(ids).not.toContain("c3");
    expect(meta.keyPoints[0]!.findingIds).toEqual(["f1"]);
    expect(Object.values(meta.sections).every((s) => s.aiHash === null)).toBe(true);
  });

  it("builds from an AI draft with data blocks and valid capture ids only", () => {
    const { content, meta } = buildReportFromDraft(ctx, draft, ["f1"], new Set(["c1", "c2"]), { jobId: "j", model: "m" });
    const samenvatting = sectionByKey(content, "samenvatting")!;
    expect(samenvatting.content!.some((n) => n.type === "dataBlock" && n.attrs?.kind === "keyPoints")).toBe(true);
    expect(JSON.stringify(sectionByKey(content, "bevindingen"))).toContain('"findingId":"f1"');
    expect(meta.keyPoints[0]!.captureIds).toEqual(["c1"]);
    expect(meta.keyPoints[0]!.accepted).toBe(false);
    expect(meta.openQuestions[0]!.question).toBe("Vraag?");
    expect(isSectionEdited(samenvatting, meta.sections.samenvatting)).toBe(false);
  });

  it("regeneration keeps manually edited sections unless forced", () => {
    const first = buildReportFromDraft(ctx, draft, ["f1"], new Set(["c1", "c2"]), { jobId: "1", model: "m" });
    const editedSection = section("bevindingen", "Bevindingen", [paragraph("Handmatig herschreven.")]);
    const edited = { content: replaceSection(first.content, "bevindingen", editedSection), meta: first.meta };
    expect(isSectionEdited(sectionByKey(edited.content, "bevindingen")!, edited.meta.sections.bevindingen)).toBe(true);
    const second = buildReportFromDraft(ctx, { ...draft, summary: "Nieuwe samenvatting." }, ["f1"], new Set(["c1", "c2"]), { jobId: "2", model: "m" });
    const merged = mergeGenerated(edited, second);
    expect(merged.kept).toEqual(["bevindingen"]);
    expect(JSON.stringify(sectionByKey(merged.content, "bevindingen"))).toContain("Handmatig herschreven.");
    expect(JSON.stringify(sectionByKey(merged.content, "samenvatting"))).toContain("Nieuwe samenvatting.");
    const forced = mergeGenerated(edited, second, { force: true });
    expect(JSON.stringify(sectionByKey(forced.content, "bevindingen"))).not.toContain("Handmatig herschreven.");
  });

  it("places AI photos with their explanation and puts unplaced photos after their finding", () => {
    const { content } = buildReportFromDraft(ctx, draft, ["f1"], new Set(["c1", "c2"]), { jobId: "j", model: "m" });
    const nodes = sectionByKey(content, "bevindingen")!.content!;
    const boom = nodes.find((n) => n.type === "photo" && n.attrs?.captureId === "c2")!;
    expect(boom.attrs?.note).toBe("Boom staat binnen de kroonprojectie.");
    // c1 was not placed by the AI but belongs to finding f1: directly after its finding_ref.
    const at = nodes.findIndex((n) => n.type === "findingRef");
    expect(nodes[at + 1]).toMatchObject({ type: "photo", attrs: { captureId: "c1", caption: "Sleuf" } });
    expect(referencedCaptureIds(content)).not.toContain("c3");
  });

  it("puts photos without a finding under 'Overige foto's' with the analysis as explanation", () => {
    const withAnalysis: BuildContext = { ...ctx, captures: [...ctx.captures, { id: "c4", type: "photo", seq: 4, hiddenInReport: false, capturedAt: new Date(), note: null, analysis: { caption: "Klinkers", description: "Herstraat klinkerwerk." }, shotId: null }] };
    const { content } = buildReportFromDraft(withAnalysis, draft, ["f1"], new Set(["c1", "c2", "c4"]), { jobId: "j", model: "m" });
    const text = JSON.stringify(sectionByKey(content, "bevindingen"));
    expect(text).toContain("Overige foto's");
    expect(text).toContain('"note":"Herstraat klinkerwerk."');
  });

  it("AI proposal replaces untouched baseline sections but keeps edited ones", () => {
    const base = buildBaselineReport(ctx);
    expect(isSectionEdited(sectionByKey(base.content, "bevindingen")!, base.meta.sections.bevindingen)).toBe(false);
    const edited = { content: replaceSection(base.content, "doel_scope", section("doel_scope", "Doel en scope", [paragraph("Eigen tekst.")])), meta: base.meta };
    const generated = buildReportFromDraft(ctx, draft, ["f1"], new Set(["c1", "c2"]), { jobId: "j", model: "m" });
    const merged = mergeGenerated(edited, generated);
    expect(merged.kept).toEqual(["doel_scope"]);
    expect(JSON.stringify(sectionByKey(merged.content, "samenvatting"))).toContain("AI-samenvatting.");
  });

  it("section hash ignores the title", () => {
    const a = section("x", "Titel A", [paragraph("tekst")]);
    const b = section("x", "Titel B", [paragraph("tekst")]);
    expect(sectionHash(a)).toBe(sectionHash(b));
  });
});

describe("version diff", () => {
  it("diffs words", () => {
    const parts = diffWords("de kabel ligt ondiep", "de kabel ligt te ondiep");
    expect(parts.filter((p) => p.type === "added").map((p) => p.text.trim())).toEqual(["te"]);
  });
  it("diffs sections", () => {
    const a = { type: "doc" as const, content: [section("s", "S", [paragraph("oud")]), section("r", "R", [paragraph("weg")])] };
    const b = { type: "doc" as const, content: [section("s", "S", [paragraph("nieuw")]), section("n", "N", [paragraph("erbij")])] };
    const d = diffReports(a, b);
    expect(d.find((x) => x.key === "s")?.status).toBe("changed");
    expect(d.find((x) => x.key === "r")?.status).toBe("removed");
    expect(d.find((x) => x.key === "n")?.status).toBe("added");
  });
});

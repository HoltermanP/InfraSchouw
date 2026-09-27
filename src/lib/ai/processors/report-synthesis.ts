import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, aiJobs, billingEvidence, findingCaptures, findings, inspections } from "@/db/schema";
import { env } from "@/lib/env";
import { reportDraftSchema, type ReportDraft } from "@/lib/ai/schemas";
import { reportSystemPrompt } from "@/lib/ai/prompts";
import { structuredCall } from "@/lib/ai/structured";
import { sourcesContent } from "@/lib/ai/sources";
import { DeferJob, SkipJob } from "@/lib/ai/runner";
import { loadInspectionContext, reportPhotos, type InspectionContext } from "@/lib/report/context";
import { buildReportFromDraft, mergeGenerated } from "@/lib/report/build";
import { ensureBaselineReport, ensureReport, saveReportVersion } from "@/lib/report/service";
import { mergeAiDescription, pruneCaptureIds } from "@/lib/station/merge";
import { getStationDescription, runAsbuiltCheck, saveStationDescription } from "@/lib/station/service";
import { audit } from "@/db/queries/audit";
import { enqueueJob } from "@/lib/ai/enqueue";
import { linkSegmentsToCaptures } from "@/lib/ai/link-segments";
import type { OrgCtx } from "@/db/scope";
import type { JobContext, JobOutcome } from "./types";

/** Capture jobs of this inspection that are still pending. */
async function pendingCaptureJobs(orgId: string, inspectionId: string) {
  return db.$count(
    aiJobs,
    and(
      eq(aiJobs.orgId, orgId),
      inArray(aiJobs.type, ["capture_analysis", "transcription"]),
      inArray(aiJobs.status, ["queued", "running"]),
      sql`${aiJobs.inputRef}->>'inspectionId' = ${inspectionId}`,
    ),
  );
}

/** Remove any capture id that does not belong to this inspection (7.3). */
export function pruneDraft(draft: ReportDraft, valid: Set<string>): { draft: ReportDraft; removed: string[] } {
  const removed = new Set<string>();
  const keep = (ids: string[]) =>
    ids.filter((id) => {
      if (valid.has(id)) return true;
      removed.add(id);
      return false;
    });
  const out: ReportDraft = {
    ...draft,
    key_points: draft.key_points.map((k) => ({ ...k, capture_ids: keep(k.capture_ids) })),
    findings: draft.findings.map((f) => ({ ...f, capture_ids: keep(f.capture_ids) })),
    quantities: draft.quantities?.map((q) => ({ ...q, capture_ids: keep(q.capture_ids) })) ?? null,
    sections: draft.sections.map((s) => ({
      ...s,
      blocks: s.blocks.filter((b) => {
        if (b.type === "photo") {
          if (valid.has(b.capture_id)) return true;
          removed.add(b.capture_id);
          return false;
        }
        if (b.type === "photo_grid") {
          b.capture_ids = keep(b.capture_ids);
          return b.capture_ids.length > 0;
        }
        return true;
      }),
    })),
    station: draft.station,
  };
  if (out.station) {
    const pruned = pruneCaptureIds(out.station, valid);
    out.station = pruned.desc;
    pruned.removed.forEach((id) => removed.add(id));
  }
  return { draft: out, removed: [...removed] };
}

/** Store AI findings/actions/station/quantities as proposals. Returns finding ids by draft index. */
async function applyDraftData(orgCtx: OrgCtx, ictx: InspectionContext, draft: ReportDraft, userId: string | null) {
  const findingIds: (string | null)[] = [];
  for (const f of draft.findings) {
    const existing = f.id ? ictx.findings.find((x) => x.id === f.id) : undefined;
    if (existing) {
      if (!existing.recommendation && f.recommendation) {
        await db.update(findings).set({ recommendation: f.recommendation }).where(eq(findings.id, existing.id));
      }
      findingIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(findings)
      .values({
        orgId: orgCtx.orgId,
        inspectionId: ictx.inspection.id,
        projectId: ictx.inspection.projectId,
        title: f.title,
        description: f.description,
        category: f.category,
        priority: f.priority,
        recommendation: f.recommendation,
        lat: f.location?.lat ?? null,
        lon: f.location?.lon ?? null,
        source: "ai",
        aiAccepted: false,
        confidence: 0.7,
        createdBy: userId,
      })
      .returning();
    if (f.capture_ids.length) {
      await db.insert(findingCaptures).values(f.capture_ids.map((captureId) => ({ orgId: orgCtx.orgId, findingId: row!.id, captureId }))).onConflictDoNothing();
    }
    findingIds.push(row!.id);
  }
  const mapFindingRefs = (refs: string[]) =>
    refs.map((r) => (/^\d+$/.test(r) ? findingIds[Number(r)] : ictx.findings.some((f) => f.id === r) ? r : null)).filter((x): x is string => Boolean(x));
  for (const a of draft.actions) {
    await db.insert(actions).values({
      orgId: orgCtx.orgId,
      inspectionId: ictx.inspection.id,
      projectId: ictx.inspection.projectId,
      description: a.description,
      owner: a.owner_suggestion,
      dueDate: a.due_suggestion && /^\d{4}-\d{2}-\d{2}$/.test(a.due_suggestion) ? a.due_suggestion : null,
      findingIds: mapFindingRefs(a.finding_ids),
      source: "ai",
      aiAccepted: false,
      createdBy: userId,
    });
  }
  if (draft.station && ictx.inspection.stationId && ictx.template.isStation) {
    const existing = await getStationDescription(orgCtx.orgId, ictx.inspection.id);
    const merged = mergeAiDescription(existing?.data ?? null, draft.station, 0.7);
    await saveStationDescription(orgCtx, ictx.inspection.id, ictx.inspection.stationId, merged);
    await runAsbuiltCheck(orgCtx, ictx.inspection.id);
  }
  if (draft.quantities?.length && ictx.template.isBilling && ictx.billingItems.length) {
    // Replace earlier unconfirmed AI proposals for this inspection.
    await db
      .delete(billingEvidence)
      .where(and(eq(billingEvidence.orgId, orgCtx.orgId), eq(billingEvidence.inspectionId, ictx.inspection.id), eq(billingEvidence.source, "ai"), eq(billingEvidence.status, "voorgesteld")));
    for (const q of draft.quantities) {
      const item = ictx.billingItems.find((b) => b.code === q.post_code);
      if (!item) continue;
      await db.insert(billingEvidence).values({
        orgId: orgCtx.orgId,
        billingItemId: item.id,
        inspectionId: ictx.inspection.id,
        quantity: q.found_quantity,
        captureIds: q.capture_ids,
        status: "voorgesteld",
        confidence: q.confidence,
        remark: q.remark,
        source: "ai",
        createdBy: userId,
      });
    }
  }
  return findingIds;
}

export async function processReportSynthesis(ctx: JobContext): Promise<JobOutcome> {
  const inspectionId = ctx.job.inputRef.inspectionId;
  if (!inspectionId) throw new SkipJob("Geen schouw opgegeven.");
  const orgCtx = ctx.orgCtx;

  if (!ctx.aiEnabled) {
    await ensureBaselineReport(orgCtx, inspectionId);
    await runAsbuiltCheck(orgCtx, inspectionId);
    await db.update(inspections).set({ status: "verwerkt" }).where(and(eq(inspections.orgId, ctx.org.id), eq(inspections.id, inspectionId), eq(inspections.status, "afgerond")));
    throw new SkipJob(ctx.openai ? "Verslag-synthese staat uit — basisverslag gemaakt uit de vastgelegde gegevens." : "AI overgeslagen (geen OpenAI-sleutel) — basisverslag gemaakt uit de vastgelegde gegevens.");
  }

  // Link spoken text to all captures that have arrived by now (also late uploads).
  await linkSegmentsToCaptures(ctx.org.id, inspectionId);
  let ictx = await loadInspectionContext(ctx.org.id, inspectionId);
  if (!ictx) throw new SkipJob("Schouw bestaat niet meer.");

  const pending = await pendingCaptureJobs(ctx.org.id, inspectionId);
  if (pending > 0) throw new DeferJob(`Wacht op ${pending} capture-analyse(s).`, 20);

  // Every report photo is analysed first so its analysis is input for the report. Photos
  // without an analysis (e.g. uploaded before AI was on) get one attempt per synthesis job.
  const unanalysed = ctx.org.settings.ai.captureAnalysis ? reportPhotos(ictx).filter((c) => !c.analysis && c.blobUrl) : [];
  for (const c of unanalysed) {
    await enqueueJob(orgCtx, "capture_analysis", { captureId: c.id, inspectionId }, `capture_analysis:${c.id}:${ctx.job.id}`);
  }
  if (unanalysed.length) {
    const started = await pendingCaptureJobs(ctx.org.id, inspectionId);
    if (started > 0) throw new DeferJob(`Wacht op analyse van ${started} foto('s).`, 20);
    // Jobs that ran inline are already done: reload so their analyses are included.
    ictx = (await loadInspectionContext(ctx.org.id, inspectionId)) ?? ictx;
  }

  if (ictx.report && (ictx.report.status === "definitief" || ictx.report.lockedAt)) {
    throw new SkipJob("Het verslag is definitief en vergrendeld; maak eerst een herziene versie.");
  }

  const model = env.openai.reportModel;
  const result = await structuredCall(ctx.openai!, {
    model,
    schema: reportDraftSchema,
    name: "report_draft",
    system: reportSystemPrompt({
      templateInstructions: ictx.template.aiInstructions,
      orgInstructions: ctx.org.settings.ai.extraInstructions,
      isStation: ictx.template.isStation && Boolean(ictx.station),
      isBilling: ictx.template.isBilling && ictx.billingItems.length > 0,
    }),
    content: await sourcesContent(ictx),
    maxOutputTokens: 32000,
    reasoningEffort: "medium",
  });

  const valid = new Set(ictx.captures.map((c) => c.id));
  const { draft, removed } = pruneDraft(result.data, valid);
  if (removed.length) console.warn(`[ai] report ${inspectionId}: ${removed.length} onbekende capture_ids verwijderd`, removed);

  const findingIds = await applyDraftData(orgCtx, ictx, draft, ctx.job.createdBy);
  const fresh = (await loadInspectionContext(ctx.org.id, inspectionId))!;
  const generated = buildReportFromDraft(fresh, draft, findingIds, valid, { jobId: ctx.job.id, model });
  const report = await ensureReport(orgCtx, inspectionId, draft.title || fresh.inspection.title);
  const existing = fresh.currentVersion ? { content: fresh.currentVersion.content, meta: fresh.currentVersion.meta } : null;
  const merged = mergeGenerated(existing, generated, { force: Boolean(ctx.job.inputRef.force) });
  const version = await saveReportVersion(orgCtx, report.id, {
    content: merged.content,
    meta: merged.meta,
    status: existing ? undefined : "concept",
    authorId: null,
    note: merged.kept.length ? `AI-voorstel; handmatig bewerkte secties behouden: ${merged.kept.join(", ")}` : "AI-voorstel",
  });
  await db.update(inspections).set({ status: "verwerkt" }).where(and(eq(inspections.id, inspectionId), eq(inspections.status, "afgerond")));
  await audit(orgCtx, "ai_report", "report", report.id, `AI-verslagvoorstel gegenereerd (${model})`);

  return {
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    output: { reportVersionId: version.id, removedCaptureIds: removed, message: result.retried ? "Geldig na herkansing" : undefined },
  };
}

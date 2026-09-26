"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  actions,
  captureAnnotations,
  captures,
  checklistAnswers,
  findingCaptures,
  findings,
  inspectionParticipants,
  inspections,
  projects,
  reportExports,
  reports,
  templateChecklistItems,
} from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit, diffFields } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { ACTION_STATUSES, FINDING_CATEGORIES, FINDING_STATUSES, PRIORITIES } from "@/lib/domain";
import { rdFor } from "@/lib/capture-sources/persist";
import { deleteObject, putObject } from "@/lib/storage";
import { enqueueInspectionProcessing, enqueueReportSynthesis } from "@/lib/ai/enqueue";
import { ensureBaselineReport } from "@/lib/report/service";
import { runAsbuiltCheck } from "@/lib/station/service";

const uuid = z.string().uuid();

function revalidateInspection(id: string) {
  revalidatePath(`/schouwen/${id}`, "layout");
}

export async function linkInspectionToProject(inspectionId: string, projectId: string | null) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const s = scoped(ctx);
    const insp = await s.getById(inspections, inspectionId);
    if (projectId) await s.getById(projects, projectId, "Project niet gevonden.");
    await s.update(inspections, inspectionId, { projectId });
    await s.updateWhere(findings, { projectId }, eq(findings.inspectionId, inspectionId));
    await s.updateWhere(actions, { projectId }, eq(actions.inspectionId, inspectionId));
    await audit(ctx, projectId ? "link_project" : "unlink_project", "inspection", inspectionId, projectId ? `Schouw "${insp.title}" gekoppeld aan project` : "Koppeling met project verwijderd", { projectId });
    revalidateInspection(inspectionId);
    revalidatePath("/schouwen");
    return null;
  }, projectId ? "Schouw gekoppeld aan project" : "Koppeling verwijderd");
}

export async function updateInspectionMeta(inspectionId: string, input: { title: string; notes: string | null }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = z.object({ title: z.string().trim().min(2).max(300), notes: z.string().max(5000).nullable() }).parse(input);
    await scoped(ctx).update(inspections, inspectionId, data);
    revalidateInspection(inspectionId);
    return null;
  }, "Opgeslagen");
}

// --- Findings ----------------------------------------------------------------
const findingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000),
  category: z.enum(FINDING_CATEGORIES),
  priority: z.enum(PRIORITIES),
  status: z.enum(FINDING_STATUSES),
  recommendation: z.string().max(5000).nullable(),
  captureIds: z.array(uuid).max(100),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
});
export type FindingInput = z.input<typeof findingSchema>;

async function setFindingCaptures(orgId: string, findingId: string, captureIds: string[]) {
  await db.delete(findingCaptures).where(and(eq(findingCaptures.orgId, orgId), eq(findingCaptures.findingId, findingId)));
  if (captureIds.length) await db.insert(findingCaptures).values(captureIds.map((captureId) => ({ orgId, findingId, captureId }))).onConflictDoNothing();
}

export async function saveFinding(inspectionId: string, findingId: string | null, input: FindingInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = findingSchema.parse(input);
    const s = scoped(ctx);
    const insp = await s.getById(inspections, inspectionId);
    if (data.captureIds.length) await s.assertOwned(captures, data.captureIds);
    const { captureIds, ...values } = data;
    let id = findingId;
    if (id) {
      const before = await s.getById(findings, id);
      const after = await s.update(findings, id, { ...values, aiAccepted: true });
      await audit(ctx, "update", "finding", id, `Bevinding "${after.title}" gewijzigd`, diffFields(before, after));
    } else {
      const [row] = await s.insert(findings, { ...values, inspectionId, projectId: insp.projectId, source: "handmatig", lat: values.lat ?? null, lon: values.lon ?? null });
      id = row!.id;
      await audit(ctx, "create", "finding", id, `Bevinding "${values.title}" toegevoegd`);
    }
    await setFindingCaptures(ctx.orgId, id!, captureIds);
    revalidateInspection(inspectionId);
    return { id: id! };
  }, "Bevinding opgeslagen");
}

export async function setFindingField(findingId: string, patch: { status?: string; priority?: string; category?: string; aiAccepted?: boolean }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = z
      .object({ status: z.enum(FINDING_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), category: z.enum(FINDING_CATEGORIES).optional(), aiAccepted: z.boolean().optional() })
      .parse(patch);
    const before = await scoped(ctx).getById(findings, findingId);
    const after = await scoped(ctx).update(findings, findingId, data);
    await audit(ctx, "update", "finding", findingId, `Bevinding "${after.title}" gewijzigd`, diffFields(before, after));
    revalidateInspection(after.inspectionId);
    return null;
  });
}

export async function deleteFinding(findingId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const f = await scoped(ctx).getById(findings, findingId);
    await scoped(ctx).remove(findings, findingId);
    await audit(ctx, "delete", "finding", findingId, `Bevinding "${f.title}" verwijderd`);
    revalidateInspection(f.inspectionId);
    return null;
  }, "Bevinding verwijderd");
}

// --- Actions -----------------------------------------------------------------
const actionSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  owner: z.string().trim().max(200).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(ACTION_STATUSES),
  findingIds: z.array(uuid).max(50),
});
export type ActionInput = z.input<typeof actionSchema>;

export async function saveAction(inspectionId: string, actionId: string | null, input: ActionInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = actionSchema.parse(input);
    const s = scoped(ctx);
    const insp = await s.getById(inspections, inspectionId);
    if (data.findingIds.length) await s.assertOwned(findings, data.findingIds);
    if (actionId) {
      const before = await s.getById(actions, actionId);
      const after = await s.update(actions, actionId, { ...data, aiAccepted: true });
      await audit(ctx, "update", "action", actionId, "Actiepunt gewijzigd", diffFields(before, after));
    } else {
      const [row] = await s.insert(actions, { ...data, inspectionId, projectId: insp.projectId, source: "handmatig" });
      await audit(ctx, "create", "action", row!.id, "Actiepunt toegevoegd");
    }
    revalidateInspection(inspectionId);
    return null;
  }, "Actiepunt opgeslagen");
}

export async function setActionField(actionId: string, patch: { status?: string; aiAccepted?: boolean }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = z.object({ status: z.enum(ACTION_STATUSES).optional(), aiAccepted: z.boolean().optional() }).parse(patch);
    const after = await scoped(ctx).update(actions, actionId, data);
    revalidateInspection(after.inspectionId);
    revalidatePath("/dashboard");
    return null;
  });
}

export async function deleteAction(actionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const a = await scoped(ctx).getById(actions, actionId);
    await scoped(ctx).remove(actions, actionId);
    await audit(ctx, "delete", "action", actionId, "Actiepunt verwijderd");
    revalidateInspection(a.inspectionId);
    return null;
  }, "Actiepunt verwijderd");
}

// --- Captures (media tab) -----------------------------------------------------
export async function updateCaptures(ids: string[], patch: { addTags?: string[]; removeTags?: string[]; hiddenInReport?: boolean; note?: string | null; findingId?: string | null }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const s = scoped(ctx);
    z.array(uuid).min(1).max(500).parse(ids);
    await s.assertOwned(captures, ids);
    const rows = await s.list(captures, inArray(captures.id, ids));
    for (const c of rows) {
      const tags = new Set(c.tags);
      patch.addTags?.forEach((t) => tags.add(t.trim().toLowerCase()));
      patch.removeTags?.forEach((t) => tags.delete(t));
      await s.update(captures, c.id, {
        tags: [...tags].filter(Boolean),
        ...(patch.hiddenInReport !== undefined ? { hiddenInReport: patch.hiddenInReport } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      });
    }
    if (patch.findingId) {
      await s.getById(findings, patch.findingId);
      await db.insert(findingCaptures).values(ids.map((captureId) => ({ orgId: ctx.orgId, findingId: patch.findingId!, captureId }))).onConflictDoNothing();
    }
    if (rows[0]?.inspectionId) revalidateInspection(rows[0].inspectionId);
    return null;
  }, "Media bijgewerkt");
}

export async function setCaptureLocation(captureId: string, lat: number, lon: number) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).parse({ lat, lon });
    const c = await scoped(ctx).update(captures, captureId, { ...data, ...rdFor(data.lat, data.lon), locationSource: "manual" });
    await audit(ctx, "relocate", "capture", captureId, "Locatie handmatig gecorrigeerd", data);
    if (c.inspectionId) revalidateInspection(c.inspectionId);
    return null;
  }, "Locatie bijgewerkt");
}

export async function saveAnnotation(formData: FormData) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const captureId = uuid.parse(formData.get("captureId"));
    const drawing = JSON.parse(String(formData.get("drawing") ?? "{}"));
    const file = formData.get("rendered");
    if (!(file instanceof Blob)) throw new UserError("Geen afbeelding ontvangen.");
    const c = await scoped(ctx).getById(captures, captureId);
    const stored = await putObject(`orgs/${ctx.orgId}/inspections/${c.inspectionId ?? "inbox"}/${c.id}-annotated.jpg`, Buffer.from(await file.arrayBuffer()), "image/jpeg");
    await scoped(ctx).insert(captureAnnotations, { captureId, drawing, renderedUrl: stored.url });
    const hasBlur = Array.isArray(drawing?.shapes) && drawing.shapes.some((s: { kind?: string }) => s.kind === "blur");
    if (hasBlur) await scoped(ctx).update(captures, captureId, { privacyBlurred: true });
    await audit(ctx, "annotate", "capture", captureId, hasBlur ? "Annotatie met vervaging (AVG) opgeslagen" : "Annotatie opgeslagen");
    if (c.inspectionId) revalidateInspection(c.inspectionId);
    return null;
  }, "Annotatie opgeslagen — het origineel blijft bewaard");
}

export async function deleteCaptureAction(captureId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const c = await scoped(ctx).getById(captures, captureId);
    const anns = await scoped(ctx).list(captureAnnotations, eq(captureAnnotations.captureId, captureId));
    await scoped(ctx).remove(captures, captureId);
    await Promise.all([deleteObject(c.blobUrl), c.thumbUrl !== c.blobUrl ? deleteObject(c.thumbUrl) : null, ...anns.map((a) => deleteObject(a.renderedUrl)), ...(c.meta.keyframes ?? []).map((k) => deleteObject(k.url))]);
    await audit(ctx, "delete", "capture", captureId, "Capture verwijderd");
    if (c.inspectionId) revalidateInspection(c.inspectionId);
    return null;
  }, "Capture verwijderd");
}

// --- Checklist (backend edit) --------------------------------------------------
export async function saveChecklistAnswer(inspectionId: string, itemId: string, input: { value: string | number | null; note: string | null }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    await scoped(ctx).getById(inspections, inspectionId);
    await scoped(ctx).getById(templateChecklistItems, itemId);
    await db
      .insert(checklistAnswers)
      .values({ orgId: ctx.orgId, inspectionId, itemId, value: input.value, note: input.note, createdBy: ctx.userId })
      .onConflictDoUpdate({ target: [checklistAnswers.inspectionId, checklistAnswers.itemId], set: { value: input.value, note: input.note, skippedReason: null, answeredAt: new Date() }, setWhere: eq(checklistAnswers.orgId, ctx.orgId) });
    revalidateInspection(inspectionId);
    return null;
  }, "Antwoord opgeslagen");
}

// --- Processing --------------------------------------------------------------------
export async function rerunProcessing(inspectionId: string, mode: "all" | "report", force = false) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const insp = await scoped(ctx).getById(inspections, inspectionId);
    if (insp.status === "lopend") throw new UserError("De schouw is nog niet afgerond.");
    if (mode === "all") await enqueueInspectionProcessing(ctx, inspectionId);
    else await enqueueReportSynthesis(ctx, inspectionId, { force });
    await ensureBaselineReport(ctx, inspectionId);
    revalidateInspection(inspectionId);
    return null;
  }, "Verwerking gestart — het verslagvoorstel verschijnt zodra het klaar is");
}

export async function finishInspectionInBackend(inspectionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const insp = await scoped(ctx).getById(inspections, inspectionId);
    if (insp.status !== "lopend") return null;
    await scoped(ctx).update(inspections, inspectionId, { status: "afgerond", endedAt: new Date() });
    await audit(ctx, "finish", "inspection", inspectionId, `Schouw "${insp.title}" afgerond (backend)`);
    await enqueueInspectionProcessing(ctx, inspectionId);
    await ensureBaselineReport(ctx, inspectionId);
    revalidateInspection(inspectionId);
    return null;
  }, "Schouw afgerond — verwerking gestart");
}

export async function runAsbuilt(inspectionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    await scoped(ctx).getById(inspections, inspectionId);
    const rows = await runAsbuiltCheck(ctx, inspectionId);
    if (!rows) throw new UserError("Geen verwachte configuratie voor dit station — leg die eerst vast op de stationspagina.");
    revalidateInspection(inspectionId);
    return { deviations: rows.filter((r) => r.status === "afwijkend").length };
  }, "As-built-check uitgevoerd");
}

/** AVG: remove an inspection and every stored file belonging to it. */
export async function deleteInspectionCompletely(inspectionId: string, confirmTitle: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const insp = await scoped(ctx).getById(inspections, inspectionId);
    if (confirmTitle.trim() !== insp.title.trim()) throw new UserError("De ingevoerde titel komt niet overeen.");
    const caps = await scoped(ctx).list(captures, eq(captures.inspectionId, inspectionId));
    const anns = caps.length ? await db.select().from(captureAnnotations).where(and(eq(captureAnnotations.orgId, ctx.orgId), inArray(captureAnnotations.captureId, caps.map((c) => c.id)))) : [];
    const parts = await scoped(ctx).list(inspectionParticipants, eq(inspectionParticipants.inspectionId, inspectionId));
    const [report] = await db.select().from(reports).where(orgWhere(reports, ctx, eq(reports.inspectionId, inspectionId)));
    const exps = report ? await db.select().from(reportExports).where(eq(reportExports.reportId, report.id)) : [];
    const urls = [
      ...caps.flatMap((c) => [c.blobUrl, c.thumbUrl, ...(c.meta.keyframes ?? []).map((k) => k.url)]),
      ...anns.map((a) => a.renderedUrl),
      ...parts.map((p) => p.signatureUrl),
      ...exps.map((e) => e.blobUrl),
      report?.mapSnapshotUrl,
    ].filter((u): u is string => Boolean(u));
    await db.delete(inspections).where(orgWhere(inspections, ctx, eq(inspections.id, inspectionId)));
    await Promise.all([...new Set(urls)].map((u) => deleteObject(u).catch(() => undefined)));
    await audit(ctx, "delete_gdpr", "inspection", inspectionId, `Schouw "${insp.title}" volledig verwijderd (AVG), ${urls.length} bestanden gewist`);
    revalidatePath("/schouwen");
    return null;
  }, "Schouw en alle bijbehorende bestanden zijn verwijderd");
}

/** Accept all AI proposals (findings and actions) of an inspection. */
export async function acceptAllProposals(inspectionId: string, kind: "findings" | "actions") {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    await scoped(ctx).getById(inspections, inspectionId);
    const table = kind === "findings" ? findings : actions;
    const rows = await scoped(ctx).updateWhere(table, { aiAccepted: true }, eq(table.inspectionId, inspectionId), eq(table.aiAccepted, false));
    await audit(ctx, "accept_ai", kind === "findings" ? "finding" : "action", inspectionId, `${rows.length} AI-voorstel(len) geaccepteerd`);
    revalidateInspection(inspectionId);
    return { count: rows.length };
  }, "AI-voorstellen geaccepteerd");
}

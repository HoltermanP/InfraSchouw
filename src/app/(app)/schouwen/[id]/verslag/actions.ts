"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reports, reportVersions, shareLinks } from "@/db/schema";
import { orgWhere, scoped, ForbiddenError } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { REPORT_TRANSITIONS, roleAtLeast, type ReportStatus } from "@/lib/domain";
import { saveReportVersion, ensureBaselineReport } from "@/lib/report/service";
import { enqueueSectionRegeneration } from "@/lib/ai/enqueue";
import { env } from "@/lib/env";
import type { ReportMeta, TiptapDoc } from "@/lib/report/types";
import { archiveFinalPdf } from "@/lib/export/archive";
import { generateToken, hashToken } from "@/lib/share";

const docSchema = z.object({ type: z.literal("doc"), content: z.array(z.record(z.string(), z.unknown())) }).passthrough();
const metaSchema = z
  .object({
    keyPoints: z.array(
      z.object({
        id: z.string(),
        title: z.string().max(500),
        description: z.string().max(5000),
        priority: z.enum(["hoog", "midden", "laag"]),
        category: z.enum(["veiligheid", "kwaliteit", "planning", "kosten", "omgeving", "vergunning", "contract", "techniek"]),
        findingIds: z.array(z.string()),
        captureIds: z.array(z.string()),
        source: z.enum(["ai", "handmatig"]),
        accepted: z.boolean(),
      }),
    ),
    openQuestions: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string().nullable(), resolved: z.boolean() })),
    sections: z.record(z.string(), z.object({ key: z.string(), title: z.string(), aiHash: z.string().nullable(), generatedAt: z.string().nullable() })),
    generatedBy: z.object({ jobId: z.string().nullable(), model: z.string(), at: z.string() }).nullable(),
  })
  .passthrough();

async function loadReport(reportId: string) {
  const ctx = await requireCtx("schouwer");
  const report = await scoped(ctx).getById(reports, reportId, "Verslag niet gevonden.");
  return { ctx, report };
}

function revalidateReport(inspectionId: string) {
  revalidatePath(`/schouwen/${inspectionId}`, "layout");
}

export async function saveReportContent(reportId: string, input: { content: unknown; meta: unknown; note?: string | null; baseVersionId: string | null }) {
  return safeAction(async () => {
    const { ctx, report } = await loadReport(reportId);
    if (report.status === "definitief" || report.lockedAt) throw new UserError("Het verslag is definitief en vergrendeld. Kies ‘Herzien’ om een nieuwe versie te maken.");
    if (report.status === "ter_review" && !roleAtLeast(ctx.role, "projectleider")) throw new UserError("Het verslag staat ter review; alleen een projectleider kan nu wijzigen.");
    if (input.baseVersionId && report.currentVersionId && input.baseVersionId !== report.currentVersionId) {
      throw new UserError("Er is intussen een nieuwere versie opgeslagen (bijv. door AI of een collega). Laad de nieuwste versie en voer je wijziging opnieuw uit.");
    }
    const content = docSchema.parse(input.content) as unknown as TiptapDoc;
    const meta = metaSchema.parse(input.meta) as unknown as ReportMeta;
    const status: ReportStatus = report.status === "concept" ? "in_bewerking" : report.status;
    const version = await saveReportVersion(ctx, reportId, { content, meta, status, authorId: ctx.userId, note: input.note ?? null });
    revalidateReport(report.inspectionId);
    return { versionId: version.id, versionNumber: version.versionNumber, status };
  }, "Verslag opgeslagen");
}

export async function restoreReportVersion(reportId: string, versionId: string) {
  return safeAction(async () => {
    const { ctx, report } = await loadReport(reportId);
    if (report.status === "definitief") throw new UserError("Het verslag is definitief; kies eerst ‘Herzien’.");
    const [v] = await db.select().from(reportVersions).where(and(eq(reportVersions.orgId, ctx.orgId), eq(reportVersions.reportId, reportId), eq(reportVersions.id, versionId)));
    if (!v) throw new UserError("Versie niet gevonden.");
    const version = await saveReportVersion(ctx, reportId, {
      content: v.content,
      meta: v.meta,
      status: report.status === "concept" ? "in_bewerking" : report.status,
      authorId: ctx.userId,
      note: `Teruggezet naar versie ${v.versionNumber}`,
    });
    revalidateReport(report.inspectionId);
    return { versionId: version.id };
  }, "Vorige versie teruggezet (als nieuwe versie)");
}

export async function changeReportStatus(reportId: string, to: ReportStatus) {
  return safeAction(async () => {
    const { ctx, report } = await loadReport(reportId);
    const transition = REPORT_TRANSITIONS[report.status].find((t) => t.to === to);
    if (!transition) throw new UserError("Deze statusovergang is niet toegestaan.");
    if (!roleAtLeast(ctx.role, transition.minRole)) throw new ForbiddenError(`Alleen een ${transition.minRole} kan deze stap zetten.`);
    const [current] = report.currentVersionId ? await db.select().from(reportVersions).where(eq(reportVersions.id, report.currentVersionId)) : [];
    if (!current) throw new UserError("Het verslag heeft nog geen inhoud.");
    if (to === "definitief") {
      const open = current.meta.openQuestions.filter((q) => !q.resolved);
      if (open.length) throw new UserError(`Er staan nog ${open.length} open vraag/vragen van de AI; beantwoord of sluit ze eerst.`);
      const unaccepted = current.meta.keyPoints.filter((k) => k.source === "ai" && !k.accepted);
      if (unaccepted.length) throw new UserError(`${unaccepted.length} aandachtspunt(en) zijn nog AI-voorstel; accepteer of verwijder ze eerst.`);
    }
    const version = await saveReportVersion(ctx, reportId, { content: current.content, meta: current.meta, status: to, authorId: ctx.userId, note: `Status: ${transition.label}` });
    if (to === "definitief") {
      const exp = await archiveFinalPdf(ctx, reportId, version.id);
      await db.update(reports).set({ lockedAt: new Date(), finalExportId: exp.id }).where(eq(reports.id, reportId));
    }
    if (to === "herzien") {
      await db.update(reports).set({ lockedAt: null }).where(eq(reports.id, reportId));
    }
    await audit(ctx, "status", "report", reportId, `Verslagstatus → ${to}`, { from: report.status, to });
    revalidateReport(report.inspectionId);
    return { status: to };
  }, "Status gewijzigd");
}

export async function regenerateSection(reportId: string, sectionKey: string, instruction: string | null, force: boolean) {
  return safeAction(async () => {
    const { ctx, report } = await loadReport(reportId);
    if (report.status === "definitief") throw new UserError("Het verslag is definitief en vergrendeld.");
    if (!env.openai.enabled) throw new UserError("AI is niet geconfigureerd (geen OpenAI-sleutel); de sectie kan handmatig worden bewerkt.");
    const jobId = await enqueueSectionRegeneration(ctx, reportId, z.string().min(1).max(60).parse(sectionKey), instruction?.slice(0, 1000) || undefined, force);
    return { jobId };
  }, "Sectie wordt opnieuw gegenereerd…");
}

export async function createBaselineReport(inspectionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const report = await ensureBaselineReport(ctx, inspectionId);
    revalidateReport(inspectionId);
    return { reportId: report?.id ?? null };
  }, "Verslag aangemaakt");
}

// --- Share links ------------------------------------------------------------------
export async function createShareLink(reportId: string, days: number, label: string | null) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const report = await scoped(ctx).getById(reports, reportId);
    if (report.status !== "definitief" && report.status !== "herzien") throw new UserError("Alleen een definitief verslag kan extern worden gedeeld.");
    const token = generateToken();
    const expiresAt = new Date(Date.now() + z.number().int().min(1).max(365).parse(days) * 86_400_000);
    const [link] = await scoped(ctx).insert(shareLinks, { reportId, tokenHash: hashToken(token), expiresAt, label: label?.slice(0, 100) || null });
    await audit(ctx, "create", "share_link", link!.id, `Deellink aangemaakt (geldig tot ${expiresAt.toISOString().slice(0, 10)})`);
    revalidateReport(report.inspectionId);
    // The plain token is shown once; only its hash is stored.
    return { url: `${env.appUrl}/delen/${token}`, expiresAt: expiresAt.toISOString() };
  }, "Deellink aangemaakt");
}

export async function revokeShareLink(linkId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const link = await scoped(ctx).getById(shareLinks, linkId);
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(orgWhere(shareLinks, ctx, eq(shareLinks.id, linkId)));
    await audit(ctx, "revoke", "share_link", linkId, "Deellink ingetrokken");
    const [r] = await db.select({ inspectionId: reports.inspectionId }).from(reports).where(eq(reports.id, link.reportId));
    if (r) revalidateReport(r.inspectionId);
    return null;
  }, "Deellink ingetrokken");
}

export async function getVersionDiff(reportId: string, fromVersionId: string, toVersionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("lezer");
    await scoped(ctx).getById(reports, reportId);
    const rows = await db.select().from(reportVersions).where(and(eq(reportVersions.orgId, ctx.orgId), eq(reportVersions.reportId, reportId)));
    const from = rows.find((r) => r.id === fromVersionId);
    const to = rows.find((r) => r.id === toVersionId);
    if (!from || !to) throw new UserError("Versie niet gevonden.");
    const { diffReports } = await import("@/lib/report/diff");
    return { from: from.versionNumber, to: to.versionNumber, sections: diffReports(from.content, to.content) };
  });
}

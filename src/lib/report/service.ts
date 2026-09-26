import "server-only";
import { and, eq, max } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { reports, reportVersions } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import type { ReportStatus } from "@/lib/domain";
import { buildBaselineReport } from "./build";
import { loadInspectionContext } from "./context";
import type { ReportMeta, TiptapDoc } from "./types";

export async function ensureReport(ctx: OrgCtx, inspectionId: string, title: string, conn: DbOrTx = db) {
  const [existing] = await conn.select().from(reports).where(and(eq(reports.orgId, ctx.orgId), eq(reports.inspectionId, inspectionId))).limit(1);
  if (existing) return existing;
  const [created] = await conn
    .insert(reports)
    .values({ orgId: ctx.orgId, inspectionId, title, status: "concept", createdBy: ctx.userId })
    .onConflictDoNothing({ target: reports.inspectionId })
    .returning();
  if (created) return created;
  const [again] = await conn.select().from(reports).where(eq(reports.inspectionId, inspectionId)).limit(1);
  return again!;
}

/** Store a new version (every save is a version) and make it current. */
export async function saveReportVersion(
  ctx: OrgCtx,
  reportId: string,
  input: { content: TiptapDoc; meta: ReportMeta; status?: ReportStatus; authorId: string | null; note?: string | null },
  conn: DbOrTx = db,
) {
  const [report] = await conn.select().from(reports).where(and(eq(reports.orgId, ctx.orgId), eq(reports.id, reportId))).limit(1);
  if (!report) throw new Error("Verslag niet gevonden.");
  const [row] = await conn.select({ n: max(reportVersions.versionNumber) }).from(reportVersions).where(eq(reportVersions.reportId, reportId));
  const status = input.status ?? report.status;
  const [version] = await conn
    .insert(reportVersions)
    .values({
      orgId: ctx.orgId,
      reportId,
      versionNumber: (row?.n ?? 0) + 1,
      content: input.content,
      meta: input.meta,
      status,
      authorId: input.authorId,
      note: input.note ?? null,
      createdBy: input.authorId,
    })
    .returning();
  await conn.update(reports).set({ currentVersionId: version!.id, status }).where(eq(reports.id, reportId));
  await audit(
    ctx,
    "version",
    "report_version",
    version!.id,
    `Verslagversie ${version!.versionNumber} opgeslagen${input.authorId ? "" : " (AI)"}${input.note ? `: ${input.note}` : ""}`,
    { reportId },
    conn,
  );
  return version!;
}

/** Create the no-AI report for an inspection if none exists yet. */
export async function ensureBaselineReport(ctx: OrgCtx, inspectionId: string) {
  const ictx = await loadInspectionContext(ctx.orgId, inspectionId);
  if (!ictx) return null;
  if (ictx.report?.currentVersionId) return ictx.report;
  const report = await ensureReport(ctx, inspectionId, ictx.inspection.title);
  const built = buildBaselineReport(ictx);
  await saveReportVersion(ctx, report.id, { ...built, status: "concept", authorId: null, note: "Basisverslag uit vastgelegde gegevens (zonder AI)" });
  return report;
}

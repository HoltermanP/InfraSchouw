import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { PageBody } from "@/components/layout/page-header";
import { ReportEditor } from "@/components/report-editor/report-editor";
import { CreateReportButton } from "@/components/report-editor/create-report-button";
import { db } from "@/db/client";
import { reportVersions, shareLinks, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { env } from "@/lib/env";
import { loadInspectionContext } from "@/lib/report/context";
import { captureDtos } from "@/lib/report/dto";
import { asbuiltSummary } from "@/lib/station/asbuilt";
import { fileUrl } from "@/lib/media-url";

export const metadata = { title: "Schouw — verslag" };

export default async function ReportPage(props: PageProps<"/schouwen/[id]/verslag">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();

  if (!ctx.report || !ctx.currentVersion) {
    return (
      <PageBody>
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <FileText className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Nog geen verslag</h2>
          <p className="text-sm text-muted-foreground">
            {ctx.inspection.status === "lopend"
              ? "Het verslagvoorstel wordt gemaakt zodra de schouw is afgerond."
              : env.openai.enabled
                ? "De AI maakt het verslagvoorstel; dit kan enkele minuten duren. Je kunt ook direct een basisverslag maken uit de vastgelegde gegevens."
                : "AI is niet geconfigureerd. Maak een basisverslag uit de vastgelegde gegevens en werk het verder uit in de editor."}
          </p>
          {roleAtLeast(session.role, "schouwer") ? <CreateReportButton inspectionId={id} /> : null}
        </div>
      </PageBody>
    );
  }

  const [versions, links] = await Promise.all([
    db
      .select({ v: reportVersions, author: users.name })
      .from(reportVersions)
      .leftJoin(users, eq(users.id, reportVersions.authorId))
      .where(eq(reportVersions.reportId, ctx.report.id))
      .orderBy(desc(reportVersions.versionNumber)),
    db.select().from(shareLinks).where(eq(shareLinks.reportId, ctx.report.id)).orderBy(desc(shareLinks.createdAt)),
  ]);
  const v = ctx.currentVersion;
  const answered = ctx.template.checklist.filter((c) => ctx.answers.some((a) => a.itemId === c.id && (a.value !== null || a.skippedReason))).length;
  return (
    <ReportEditor
      key={v.id}
      inspectionId={id}
      reportId={ctx.report.id}
      versionId={v.id}
      versionNumber={v.versionNumber}
      status={ctx.report.status}
      role={session.role}
      content={v.content}
      meta={v.meta}
      captures={captureDtos(ctx)}
      findings={ctx.findings.map((f, i) => ({
        id: f.id,
        nr: i + 1,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
        priority: f.priority,
        category: f.category,
        status: f.status,
        captureIds: f.captureIds,
        aiAccepted: f.aiAccepted,
      }))}
      summary={{
        actions: ctx.actions.length,
        checklist: { total: ctx.template.checklist.length, answered },
        photos: ctx.captures.filter((c) => ["photo", "video", "sketch"].includes(c.type) && !c.hiddenInReport).length,
        measurements: ctx.measurements.length,
        segments: ctx.segments.length,
        participants: ctx.participants.length,
        station: ctx.station ? { code: ctx.station.code, described: Boolean(ctx.stationDescription) } : null,
        asbuilt: ctx.asbuilt ? asbuiltSummary(ctx.asbuilt.rows) : null,
        billing: ctx.billingEvidence.length,
      }}
      mapSnapshotUrl={ctx.report.mapSnapshotUrl ? fileUrl(ctx.report.mapSnapshotUrl) : null}
      versions={versions.map(({ v: row, author }) => ({
        id: row.id,
        versionNumber: row.versionNumber,
        status: row.status,
        author: row.authorId ? (author ?? "Onbekend") : null,
        createdAt: row.createdAt.toISOString(),
        note: row.note,
        inspectionId: id,
      }))}
      shareLinks={links.map((l) => ({
        id: l.id,
        label: l.label,
        expiresAt: l.expiresAt.toISOString(),
        revokedAt: l.revokedAt?.toISOString() ?? null,
        lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
        accessCount: l.accessCount,
        createdAt: l.createdAt.toISOString(),
      }))}
      aiEnabled={env.openai.enabled && session.org.settings.ai.reportSynthesis}
      initialPanel={sp.delen ? "delen" : undefined}
    />
  );
}

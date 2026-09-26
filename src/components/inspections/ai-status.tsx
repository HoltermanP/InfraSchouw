import { and, desc, eq, sql } from "drizzle-orm";
import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { aiJobs } from "@/db/schema";
import { AI_JOB_TYPE_LABELS } from "@/lib/domain";
import { AiJobBadge } from "@/components/common/status-badges";
import { fmtRelative } from "@/lib/format";
import { AutoRefresh } from "@/components/common/auto-refresh";

/** Shows AI processing progress for an inspection (auto-refreshes while jobs are pending). */
export async function AiStatus({ orgId, inspectionId }: { orgId: string; inspectionId: string }) {
  const jobs = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.orgId, orgId), sql`${aiJobs.inputRef}->>'inspectionId' = ${inspectionId}`))
    .orderBy(desc(aiJobs.createdAt))
    .limit(60);
  if (jobs.length === 0) return null;
  const pending = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const latestReport = jobs.find((j) => j.type === "report_synthesis");
  const failed = jobs.filter((j) => j.status === "failed").length;
  const skipped = jobs.filter((j) => j.status === "skipped");
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2 text-sm md:mx-8" data-testid="ai-status">
      <Bot className="size-4 text-muted-foreground" aria-hidden />
      {pending ? <span>AI-verwerking bezig: {pending} stap(pen) in wachtrij.</span> : <span>AI-verwerking afgerond.</span>}
      {latestReport ? (
        <span className="flex items-center gap-1">
          {AI_JOB_TYPE_LABELS.report_synthesis}: <AiJobBadge status={latestReport.status} /> <span className="text-xs text-muted-foreground">{fmtRelative(latestReport.updatedAt)}</span>
        </span>
      ) : null}
      {failed ? <span className="text-destructive">{failed} mislukt</span> : null}
      {skipped.length && !pending ? <span className="text-xs text-muted-foreground">{skipped[0]!.error}</span> : null}
      {pending ? <AutoRefresh seconds={5} /> : null}
    </div>
  );
}

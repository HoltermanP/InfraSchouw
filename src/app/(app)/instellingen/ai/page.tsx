import { desc, eq, sql } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { AiSettingsForm } from "@/components/settings/settings-forms";
import { AiJobBadge } from "@/components/common/status-badges";
import { db } from "@/db/client";
import { aiJobs } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { AI_JOB_TYPE_LABELS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "AI-instellingen" };

export default async function AiSettingsPage() {
  const session = await requireSession("admin");
  const [jobs, [totals]] = await Promise.all([
    db.select().from(aiJobs).where(eq(aiJobs.orgId, session.org.id)).orderBy(desc(aiJobs.createdAt)).limit(50),
    db
      .select({
        cost: sql<number>`coalesce(sum(${aiJobs.costEstimateUsd}), 0)::float`,
        input: sql<number>`coalesce(sum(${aiJobs.inputTokens}), 0)::int`,
        output: sql<number>`coalesce(sum(${aiJobs.outputTokens}), 0)::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(aiJobs)
      .where(eq(aiJobs.orgId, session.org.id)),
  ]);
  return (
    <PageBody>
      <AiSettingsForm settings={session.org.settings.ai} aiConfigured={env.openai.enabled} />
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Modellen</h2>
        <p className="text-sm text-muted-foreground">
          Vision: <code>{env.openai.visionModel}</code> · Verslag: <code>{env.openai.reportModel}</code> · Transcriptie: <code>{env.openai.transcribeModel}</code> (in te stellen via environment variables)
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Kosten- en tokenlog</h2>
        <p className="text-sm">
          {totals?.n ?? 0} jobs · {totals?.input ?? 0} input- en {totals?.output ?? 0} outputtokens · geschatte kosten ${(totals?.cost ?? 0).toFixed(4)}
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="px-2 py-1 text-left">Tijd</th>
                <th className="px-2 py-1 text-left">Stap</th>
                <th className="px-2 py-1 text-left">Status</th>
                <th className="px-2 py-1 text-left">Model</th>
                <th className="px-2 py-1 text-right">Tokens</th>
                <th className="px-2 py-1 text-right">Kosten</th>
                <th className="px-2 py-1 text-left">Melding</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">{fmtDateTime(j.createdAt)}</td>
                  <td className="px-2 py-1">{AI_JOB_TYPE_LABELS[j.type]}</td>
                  <td className="px-2 py-1">
                    <AiJobBadge status={j.status} />
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{j.model ?? "—"}</td>
                  <td className="px-2 py-1 text-right">{j.inputTokens + j.outputTokens}</td>
                  <td className="px-2 py-1 text-right">${j.costEstimateUsd.toFixed(4)}</td>
                  <td className="max-w-md truncate px-2 py-1 text-xs text-muted-foreground" title={j.error ?? ""}>
                    {j.error ?? (j.attempts > 1 ? `${j.attempts} pogingen` : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageBody>
  );
}

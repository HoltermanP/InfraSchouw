import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { env } from "@/lib/env";
import { sectionDraftSchema } from "@/lib/ai/schemas";
import { sectionSystemPrompt } from "@/lib/ai/prompts";
import { structuredCall } from "@/lib/ai/structured";
import { sourcesContent } from "@/lib/ai/sources";
import { SkipJob } from "@/lib/ai/runner";
import { loadInspectionContext } from "@/lib/report/context";
import { blocksToNodes, isSectionEdited } from "@/lib/report/build";
import { nodeText, replaceSection, section, sectionByKey, sectionHash, dataBlock, mapSnapshot } from "@/lib/report/doc";
import { saveReportVersion } from "@/lib/report/service";
import type { TiptapNode } from "@/lib/report/types";
import type { JobContext, JobOutcome } from "./types";

const FIXED: Record<string, TiptapNode[]> = {
  samenvatting: [dataBlock("keyPoints")],
  overzichtskaart: [mapSnapshot(null)],
  station: [dataBlock("station"), dataBlock("asbuilt")],
  afrekening: [dataBlock("billing")],
  actiepunten: [dataBlock("actions")],
  checklist: [dataBlock("checklist")],
  bijlagen: [dataBlock("photoRegister"), dataBlock("measurements"), dataBlock("transcript"), dataBlock("participants")],
};

export async function processSectionRegeneration(ctx: JobContext): Promise<JobOutcome> {
  const { reportId, sectionKey, instruction, force } = ctx.job.inputRef;
  if (!reportId || !sectionKey) throw new SkipJob("Verslag of sectie ontbreekt.");
  if (!ctx.aiEnabled) throw new SkipJob(ctx.openai ? "Verslag-AI staat uit in de AI-instellingen." : "AI overgeslagen: geen OpenAI-sleutel geconfigureerd.");
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, ctx.org.id), eq(reports.id, reportId))).limit(1);
  if (!report) throw new SkipJob("Verslag niet gevonden.");
  if (report.status === "definitief") throw new SkipJob("Verslag is definitief en vergrendeld.");
  const ictx = await loadInspectionContext(ctx.org.id, report.inspectionId);
  if (!ictx?.currentVersion) throw new SkipJob("Verslag heeft nog geen inhoud.");
  const current = ictx.currentVersion;
  const node = sectionByKey(current.content, sectionKey);
  const title = String(node?.attrs?.title ?? ictx.template.sections.find((s) => s.key === sectionKey)?.title ?? sectionKey);
  if (node && !force && isSectionEdited(node, current.meta.sections[sectionKey])) {
    throw new SkipJob(`Sectie "${title}" is handmatig bewerkt; kies "overschrijven" om toch opnieuw te genereren.`);
  }

  const findingList = ictx.findings.map((f, i) => `${i}: ${f.title} (${f.priority}, ${f.category})`).join("\n");
  const model = env.openai.reportModel;
  const result = await structuredCall(ctx.openai!, {
    model,
    schema: sectionDraftSchema,
    name: "section_draft",
    system: sectionSystemPrompt(title, instruction),
    content: [
      ...(await sourcesContent(ictx, 10)),
      { type: "input_text", text: `Sectiesleutel: ${sectionKey}\nHuidige tekst van de sectie:\n${node ? nodeText(node) : "(leeg)"}\n\nBevindingen (finding_index):\n${findingList || "(geen)"}` },
    ],
    maxOutputTokens: 12000,
  });
  const valid = new Set(ictx.captures.map((c) => c.id));
  const nodes = blocksToNodes(result.data.blocks, (i) => ictx.findings[i]?.id ?? null, valid);
  const fixed = (FIXED[sectionKey] ?? []).filter((f) => !nodes.some((n) => n.type === f.type && n.attrs?.kind === f.attrs?.kind));
  const next = section(sectionKey, title, [...nodes, ...fixed]);
  const content = replaceSection(current.content, sectionKey, next);
  const now = new Date().toISOString();
  const meta = {
    ...current.meta,
    sections: { ...current.meta.sections, [sectionKey]: { key: sectionKey, title, aiHash: sectionHash(next), generatedAt: now } },
    openQuestions: [
      ...current.meta.openQuestions,
      ...result.data.open_questions.map((q, i) => ({ id: `q-${Date.now()}-${i}`, question: q, answer: null, resolved: false })),
    ],
  };
  const version = await saveReportVersion(ctx.orgCtx, reportId, {
    content,
    meta,
    authorId: null,
    note: `Sectie "${title}" opnieuw gegenereerd${instruction ? ` (instructie: ${instruction.slice(0, 80)})` : ""}`,
  });
  return { model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, output: { reportVersionId: version.id } };
}

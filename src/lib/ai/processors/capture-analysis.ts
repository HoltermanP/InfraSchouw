import "server-only";
import { and, eq, max } from "drizzle-orm";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { db } from "@/db/client";
import { captureAnalyses, captures, inspections, inspectionTemplates, templateShots } from "@/db/schema";
import { captureAnalysisSchema } from "@/lib/ai/schemas";
import { VISION_SYSTEM } from "@/lib/ai/prompts";
import { structuredCall } from "@/lib/ai/structured";
import { imageDataUrl } from "@/lib/ai/images";
import { env } from "@/lib/env";
import { extractKeyframes } from "@/lib/media/ffmpeg";
import { extensionFor, getObjectBuffer, putObject } from "@/lib/storage";
import { enqueueJob } from "@/lib/ai/enqueue";
import { SkipJob } from "@/lib/ai/runner";
import type { JobContext, JobOutcome } from "./types";

/** Server-side keyframes for videos that arrived without them (ingest/import). */
async function ensureKeyframes(ctx: JobContext, capture: typeof captures.$inferSelect) {
  if (capture.meta.keyframes?.length || !capture.blobUrl) return capture.meta.keyframes ?? [];
  const obj = await getObjectBuffer(capture.blobUrl);
  if (!obj) return [];
  const res = await extractKeyframes(obj.buffer, extensionFor(capture.mime), ctx.org.settings.field.keyframeIntervalSeconds, 12);
  if (!res || res.frames.length === 0) return [];
  const keyframes: { url: string; offsetMs: number }[] = [];
  for (const [i, frame] of res.frames.entries()) {
    const stored = await putObject(`orgs/${capture.orgId}/inspections/${capture.inspectionId ?? "inbox"}/${capture.id}-kf${i}.jpg`, frame, "image/jpeg");
    keyframes.push({ url: stored.url, offsetMs: res.offsetsMs[i]! });
  }
  await db
    .update(captures)
    .set({ meta: { ...capture.meta, keyframes }, thumbUrl: capture.thumbUrl ?? keyframes[0]?.url ?? null })
    .where(eq(captures.id, capture.id));
  return keyframes;
}

export async function processCaptureAnalysis(ctx: JobContext): Promise<JobOutcome> {
  const captureId = ctx.job.inputRef.captureId;
  if (!captureId) throw new SkipJob("Geen capture opgegeven.");
  const [capture] = await db
    .select()
    .from(captures)
    .where(and(eq(captures.orgId, ctx.org.id), eq(captures.id, captureId)))
    .limit(1);
  if (!capture) throw new SkipJob("Capture bestaat niet meer.");

  // Videos without a separate audio capture: transcribe the video's own audio track.
  if (capture.type === "video") {
    const [child] = await db
      .select({ id: captures.id })
      .from(captures)
      .where(and(eq(captures.orgId, ctx.org.id), eq(captures.parentCaptureId, capture.id), eq(captures.type, "audio")))
      .limit(1);
    if (!child) {
      await enqueueJob(ctx.orgCtx, "transcription", { captureId: capture.id, inspectionId: capture.inspectionId ?? undefined }, `transcription:${capture.id}:1`);
    }
  }

  if (!ctx.aiEnabled) {
    // Still prepare keyframes so the video is usable in the report.
    if (capture.type === "video") await ensureKeyframes(ctx, capture);
    throw new SkipJob(ctx.openai ? "Foto-analyse staat uit in de AI-instellingen." : "Overgeslagen: geen OpenAI-sleutel geconfigureerd.");
  }

  const images: string[] = [];
  if (capture.type === "video") {
    const keyframes = await ensureKeyframes(ctx, capture);
    const pick = keyframes.length <= 6 ? keyframes : Array.from({ length: 6 }, (_, i) => keyframes[Math.round((i * (keyframes.length - 1)) / 5)]!);
    for (const kf of pick) {
      const url = await imageDataUrl(kf.url, 1024);
      if (url) images.push(url);
    }
  } else if (capture.blobUrl) {
    const url = await imageDataUrl(capture.blobUrl);
    if (url) images.push(url);
  }
  if (images.length === 0) throw new SkipJob("Geen beeldmateriaal beschikbaar voor analyse.");

  // Context helps the model (schouwtype, shot, notitie).
  const [insp] = capture.inspectionId
    ? await db
        .select({ title: inspections.title, template: inspectionTemplates.name, isStation: inspectionTemplates.isStation })
        .from(inspections)
        .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspections.templateId))
        .where(eq(inspections.id, capture.inspectionId))
        .limit(1)
    : [];
  const [shot] = capture.shotId ? await db.select().from(templateShots).where(eq(templateShots.id, capture.shotId)).limit(1) : [];
  const contextLines = [
    insp ? `Schouwtype: ${insp.template}${insp.isStation ? " (MS-station)" : ""}. Schouw: ${insp.title}.` : "Losse capture (nog niet aan een schouw gekoppeld).",
    shot ? `Shotlist-item: ${shot.groupName} – ${shot.title}.` : null,
    capture.note ? `Notitie van de schouwer: ${capture.note}` : null,
    capture.tags.length ? `Tags van de schouwer: ${capture.tags.join(", ")}` : null,
    capture.type === "video" ? `Dit zijn ${images.length} keyframes uit één video; analyseer de video als geheel.` : null,
    capture.type === "sketch" ? "Dit is een schets/annotatie van de schouwer." : null,
  ].filter(Boolean);

  const content: ResponseInputContent[] = [
    { type: "input_text", text: contextLines.join("\n") },
    ...images.map((url) => ({ type: "input_image" as const, image_url: url, detail: "high" as const })),
  ];
  const model = env.openai.visionModel;
  const result = await structuredCall(ctx.openai!, {
    model,
    schema: captureAnalysisSchema,
    name: "capture_analysis",
    system: VISION_SYSTEM,
    content,
    maxOutputTokens: 4000,
  });

  const [prev] = await db.select({ v: max(captureAnalyses.version) }).from(captureAnalyses).where(eq(captureAnalyses.captureId, capture.id));
  const [analysis] = await db
    .insert(captureAnalyses)
    .values({ orgId: ctx.org.id, captureId: capture.id, model, version: (prev?.v ?? 0) + 1, result: result.data, createdBy: ctx.job.createdBy })
    .returning();

  return {
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    output: { analysisId: analysis!.id, message: result.retried ? "Geldig na herkansing" : undefined },
  };
}

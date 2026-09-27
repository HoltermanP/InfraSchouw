import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { toFile } from "openai";
import type OpenAI from "openai";
import { db } from "@/db/client";
import { actions, captures, findings, inspections, measurements, transcriptSegments, transcripts } from "@/db/schema";
import { env } from "@/lib/env";
import { TRANSCRIBE_PROMPT, TRANSCRIPT_EXTRACTION_SYSTEM, DOMAIN_TERMS } from "@/lib/ai/prompts";
import { transcriptExtractionSchema } from "@/lib/ai/schemas";
import { structuredCall } from "@/lib/ai/structured";
import { SkipJob } from "@/lib/ai/runner";
import { extractAudioChunks } from "@/lib/media/ffmpeg";
import { extensionFor, getObjectBuffer } from "@/lib/storage";
import { matchTimestampToTrack } from "@/lib/geo/track-matching";
import { linkSegmentsToCaptures } from "@/lib/ai/link-segments";

export { linkSegmentsToCaptures };
import { loadTrack } from "@/lib/capture-sources/persist";
import type { JobContext, JobOutcome } from "./types";

export type RawSegment = { startMs: number; endMs: number; text: string };

const API_LIMIT_BYTES = 24 * 1024 * 1024;

/** Split text into sentences and spread them over the duration (for models without timestamps). */
export function estimateSegments(text: string, durationMs: number): RawSegment[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [];
  const total = sentences.reduce((n, s) => n + s.length, 0);
  let cursor = 0;
  return sentences.map((s) => {
    const len = Math.max(1, Math.round((s.length / total) * durationMs));
    const seg = { startMs: cursor, endMs: cursor + len, text: s };
    cursor += len;
    return seg;
  });
}

/** Transcribe one audio file with the configured model, returning timed segments. */
export async function transcribeFile(
  openai: OpenAI,
  model: string,
  file: { buffer: Buffer; name: string },
  approxDurationMs: number | null,
): Promise<{ text: string; segments: RawSegment[]; durationMs: number; inputTokens: number; outputTokens: number }> {
  const upload = await toFile(file.buffer, file.name);
  if (model === "whisper-1") {
    const res = (await openai.audio.transcriptions.create({
      file: upload,
      model,
      language: "nl",
      prompt: TRANSCRIBE_PROMPT,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    })) as unknown as { text: string; duration?: number; segments?: { start: number; end: number; text: string }[] };
    const segments = (res.segments ?? []).map((s) => ({ startMs: Math.round(s.start * 1000), endMs: Math.round(s.end * 1000), text: s.text.trim() }));
    return { text: res.text, segments, durationMs: Math.round((res.duration ?? 0) * 1000), inputTokens: 0, outputTokens: 0 };
  }
  if (model.includes("diarize")) {
    const res = (await openai.audio.transcriptions.create({
      file: upload,
      model,
      language: "nl",
      response_format: "diarized_json",
      chunking_strategy: "auto",
    })) as unknown as {
      text: string;
      duration?: number;
      segments?: { start: number; end: number; text: string; speaker?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const segments = (res.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.speaker && !/^[A-Z]$/.test(s.speaker) ? `${s.speaker}: ${s.text.trim()}` : s.text.trim(),
    }));
    return {
      text: res.text,
      segments,
      durationMs: Math.round((res.duration ?? 0) * 1000),
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
  }
  const res = (await openai.audio.transcriptions.create({
    file: upload,
    model,
    language: "nl",
    ...(model === "gpt-transcribe" ? { keywords: DOMAIN_TERMS.map((t) => t.split(" (")[0]!) } : { prompt: TRANSCRIBE_PROMPT }),
    response_format: "json",
  })) as unknown as { text: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const durationMs = approxDurationMs ?? Math.max(1000, Math.round((res.text.length / 14) * 1000));
  return {
    text: res.text,
    segments: estimateSegments(res.text, durationMs),
    durationMs,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
  };
}

export async function processTranscription(ctx: JobContext): Promise<JobOutcome> {
  const captureId = ctx.job.inputRef.captureId;
  if (!captureId) throw new SkipJob("Geen capture opgegeven.");
  const [capture] = await db.select().from(captures).where(and(eq(captures.orgId, ctx.org.id), eq(captures.id, captureId))).limit(1);
  if (!capture?.blobUrl) throw new SkipJob("Capture of audiobestand bestaat niet meer.");
  if (!ctx.aiEnabled) throw new SkipJob(ctx.openai ? "Transcriptie staat uit in de AI-instellingen." : "Overgeslagen: geen OpenAI-sleutel geconfigureerd.");

  const obj = await getObjectBuffer(capture.blobUrl);
  if (!obj) throw new SkipJob("Audiobestand niet gevonden in opslag.");
  const ext = extensionFor(capture.mime ?? obj.contentType);
  const model = env.openai.transcribeModel;

  // Split long or video files into audio chunks under the API limit.
  let files: { buffer: Buffer; name: string; offsetMs: number }[] = [{ buffer: obj.buffer, name: `audio.${ext}`, offsetMs: 0 }];
  if (obj.buffer.byteLength > API_LIMIT_BYTES || capture.type === "video") {
    const chunked = await extractAudioChunks(obj.buffer, ext);
    if (chunked && chunked.chunks.length) {
      files = chunked.chunks.map((b, i) => ({ buffer: b, name: `chunk${i}.mp3`, offsetMs: i * chunked.chunkSeconds * 1000 }));
    } else if (obj.buffer.byteLength > API_LIMIT_BYTES) {
      throw new SkipJob("Audiobestand is groter dan 25 MB en kan niet worden opgesplitst (ffmpeg niet beschikbaar).");
    }
  }

  let text = "";
  const segments: RawSegment[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let durationMs = 0;
  for (const f of files) {
    const res = await transcribeFile(ctx.openai!, model, f, files.length === 1 ? capture.durationMs : null);
    text += (text ? " " : "") + res.text.trim();
    segments.push(...res.segments.map((s) => ({ ...s, startMs: s.startMs + f.offsetMs, endMs: s.endMs + f.offsetMs })));
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    durationMs = Math.max(durationMs, f.offsetMs + res.durationMs);
  }
  if (!text.trim()) {
    return { model, inputTokens, outputTokens, audioSeconds: durationMs / 1000, output: { message: "Geen spraak herkend." } };
  }

  // Replace any previous transcript for this capture (idempotent re-run).
  await db.delete(transcripts).where(and(eq(transcripts.orgId, ctx.org.id), eq(transcripts.captureId, capture.id)));
  const [transcript] = await db
    .insert(transcripts)
    .values({ orgId: ctx.org.id, inspectionId: capture.inspectionId, captureId: capture.id, text, model, createdBy: ctx.job.createdBy })
    .returning();
  const base = capture.capturedAt.getTime();
  const segRows = segments.length ? segments : estimateSegments(text, durationMs || capture.durationMs || 10_000);
  const created = segRows.length
    ? await db
        .insert(transcriptSegments)
        .values(
          segRows.map((s) => ({
            orgId: ctx.org.id,
            transcriptId: transcript!.id,
            inspectionId: capture.inspectionId,
            startMs: s.startMs,
            endMs: s.endMs,
            startAt: new Date(base + s.startMs),
            endAt: new Date(base + s.endMs),
            text: s.text,
            createdBy: ctx.job.createdBy,
          })),
        )
        .returning()
    : [];
  if (capture.inspectionId) await linkSegmentsToCaptures(ctx.org.id, capture.inspectionId);
  const inserted = created.length
    ? await db.select().from(transcriptSegments).where(eq(transcriptSegments.transcriptId, transcript!.id)).orderBy(asc(transcriptSegments.startMs))
    : [];

  // Extract findings / measurements / actions from the spoken text.
  if (capture.inspectionId && inserted.length) {
    const numbered = inserted.map((s, i) => `[${i}] (${new Date(s.startAt).toISOString().slice(11, 19)}) ${s.text}`).join("\n");
    const extraction = await structuredCall(ctx.openai!, {
      model: env.openai.reportModel,
      schema: transcriptExtractionSchema,
      name: "transcript_extraction",
      system: TRANSCRIPT_EXTRACTION_SYSTEM,
      content: [{ type: "input_text", text: numbered }],
      maxOutputTokens: 4000,
    });
    inputTokens += extraction.inputTokens;
    outputTokens += extraction.outputTokens;
    const ex = extraction.data;
    for (const c of ex.corrected_segments) {
      const seg = inserted[c.segment_index];
      if (seg) await db.update(transcriptSegments).set({ text: c.text }).where(eq(transcriptSegments.id, seg.id));
    }
    const [insp] = await db.select().from(inspections).where(eq(inspections.id, capture.inspectionId)).limit(1);
    const track = await loadTrack(ctx.org.id, capture.inspectionId);
    const locate = (segIndex: number | null) => {
      const seg = segIndex !== null ? inserted[segIndex] : null;
      const t = seg ? new Date(seg.startAt).getTime() : base;
      const m = matchTimestampToTrack(track, t);
      return m ? { lat: m.lat, lon: m.lon } : { lat: capture.lat, lon: capture.lon };
    };
    for (const f of ex.findings) {
      const loc = locate(f.segment_index);
      await db.insert(findings).values({
        orgId: ctx.org.id,
        inspectionId: capture.inspectionId,
        projectId: insp?.projectId ?? null,
        title: f.title,
        description: f.description,
        category: f.category,
        priority: f.priority,
        lat: loc.lat,
        lon: loc.lon,
        source: "transcript",
        aiAccepted: false,
        confidence: 0.6,
        createdBy: ctx.job.createdBy,
      });
    }
    for (const m of ex.measurements) {
      const loc = locate(m.segment_index);
      const seg = m.segment_index !== null ? inserted[m.segment_index] : null;
      await db.insert(measurements).values({
        orgId: ctx.org.id,
        inspectionId: capture.inspectionId,
        captureId: null,
        photoCaptureId: seg?.captureIds?.[0] ?? null,
        kind: m.kind,
        label: m.label,
        value: m.value,
        unit: m.unit,
        lat: loc.lat,
        lon: loc.lon,
        measuredAt: seg ? new Date(seg.startAt) : capture.capturedAt,
        source: "ai",
        createdBy: ctx.job.createdBy,
      });
    }
    for (const a of ex.actions) {
      await db.insert(actions).values({
        orgId: ctx.org.id,
        inspectionId: capture.inspectionId,
        projectId: insp?.projectId ?? null,
        description: a.description,
        owner: a.owner_suggestion,
        source: "transcript",
        aiAccepted: false,
        createdBy: ctx.job.createdBy,
      });
    }
  }

  return {
    model,
    inputTokens,
    outputTokens,
    audioSeconds: durationMs / 1000,
    output: { transcriptId: transcript!.id },
  };
}

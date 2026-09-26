import { NextResponse } from "next/server";
import { withSession, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { ingestCapture, ingestMetaSchema } from "@/lib/capture-sources/glasses-ingest";
import { scoped } from "@/db/scope";
import { inspections } from "@/db/schema";

export const maxDuration = 120;

/**
 * Backend bulk import (inbox or a given inspection): one file per request with
 * metadata (EXIF read client-side and again server-side; time-matched on the
 * GPS track when there is no GPS).
 */
export const POST = withSession(async (req, session) => {
  if (session.role === "lezer") return jsonError(403, "Geen rechten.");
  await checkRateLimit("upload", session.org.id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Veld ‘file’ ontbreekt.");
  const raw = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string"));
  const meta = ingestMetaSchema.parse(raw);
  if (meta.inspectionId) await scoped(session.ctx).getById(inspections, meta.inspectionId);
  const result = await ingestCapture(session.ctx, {
    meta: { ...meta, inspectionId: meta.inspectionId },
    file: { buffer: Buffer.from(await file.arrayBuffer()), mime: file.type || "application/octet-stream", name: file.name },
    source: "file-import",
    forceInbox: !meta.inspectionId,
  });
  return NextResponse.json(result, { status: 201 });
}, "schouwer");

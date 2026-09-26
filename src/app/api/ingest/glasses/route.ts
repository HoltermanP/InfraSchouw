import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices";
import { ingestCapture, ingestMetaSchema, activeInspectionFor } from "@/lib/capture-sources/glasses-ingest";
import { jsonError, withErrors } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const MAX_DIRECT_BYTES = 50 * 1024 * 1024;

/**
 * Smart-glasses ingest (device token). Accepts either
 *  - multipart/form-data with `file` plus metadata fields, or
 *  - JSON with `fileUrl` (after a presigned upload via /api/ingest/glasses/uploads) plus metadata.
 * The capture lands in the running inspection of the device's user, otherwise in the inbox.
 */
export const POST = withErrors(async (req: Request) => {
  const auth = await authenticateDevice(req.headers.get("authorization"));
  if (!auth) return jsonError(401, "Ongeldig of ingetrokken apparaattoken.");
  await checkRateLimit("ingest", auth.device.id);
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Veld ‘file’ ontbreekt.");
    if (file.size > MAX_DIRECT_BYTES) return jsonError(413, "Bestand te groot voor directe upload; gebruik /api/ingest/glasses/uploads.");
    const raw = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string"));
    const meta = ingestMetaSchema.parse(raw);
    const result = await ingestCapture(auth.ctx, {
      meta,
      file: { buffer: Buffer.from(await file.arrayBuffer()), mime: file.type || "application/octet-stream", name: file.name },
      source: "glasses-ingest",
      device: auth.device,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : null;
  if (!fileUrl) return jsonError(400, "Stuur multipart met ‘file’, of JSON met ‘fileUrl’.");
  const meta = ingestMetaSchema.parse(body);
  const result = await ingestCapture(auth.ctx, { meta, storedUrl: fileUrl, mime: typeof body.contentType === "string" ? body.contentType : null, source: "glasses-ingest", device: auth.device });
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});

/** Status for the companion app: which inspection new captures will go to. */
export const GET = withErrors(async (req: Request) => {
  const auth = await authenticateDevice(req.headers.get("authorization"));
  if (!auth) return jsonError(401, "Ongeldig of ingetrokken apparaattoken.");
  const active = await activeInspectionFor(auth.ctx, new Date());
  return NextResponse.json({
    device: { id: auth.device.id, name: auth.device.name, kind: auth.device.kind },
    activeInspection: active ? { id: active.id, title: active.title, startedAt: active.startedAt } : null,
    target: active ? "inspection" : "inbox",
  });
});

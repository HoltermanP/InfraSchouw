import { NextResponse } from "next/server";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { z } from "zod";
import { authenticateDevice } from "@/lib/devices";
import { jsonError, withErrors } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { extensionFor, storageMode } from "@/lib/storage";

const bodySchema = z.object({
  fileName: z.string().max(300),
  contentType: z.string().regex(/^(image|video|audio)\/[\w.+-]+$/),
  size: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
});

/**
 * Step 1 of a large upload (e.g. glasses video): returns a short-lived URL to
 * PUT the file to. Blob mode: a Vercel Blob presigned PUT URL (the file never
 * passes through the app). Local mode: an app route authorised with the same
 * device token. Step 2: POST /api/ingest/glasses with JSON { fileUrl, ... }.
 */
export const POST = withErrors(async (req: Request) => {
  const auth = await authenticateDevice(req.headers.get("authorization"));
  if (!auth) return jsonError(401, "Ongeldig of ingetrokken apparaattoken.");
  await checkRateLimit("ingest", auth.device.id);
  const body = bodySchema.parse(await req.json());
  const pathname = `orgs/${auth.ctx.orgId}/ingest/${auth.device.id}/${crypto.randomUUID()}.${extensionFor(body.contentType)}`;
  const validUntil = Date.now() + 30 * 60_000;
  if (storageMode() === "blob") {
    const signed = await issueSignedToken({
      pathname,
      operations: ["put"],
      validUntil,
      allowedContentTypes: [body.contentType],
      maximumSizeInBytes: body.size + 1024,
      token: env.blob.token,
    });
    const { presignedUrl } = await presignUrl(signed, { operation: "put", pathname, access: "private", validUntil, allowedContentTypes: [body.contentType], maximumSizeInBytes: body.size + 1024 });
    return NextResponse.json({ method: "PUT", uploadUrl: presignedUrl, headers: { "content-type": body.contentType }, pathname, expiresAt: new Date(validUntil).toISOString(), finalize: "PUT-response JSON bevat `url`; stuur die als fileUrl naar POST /api/ingest/glasses" });
  }
  return NextResponse.json({
    method: "PUT",
    uploadUrl: `${env.appUrl}/api/ingest/glasses/uploads/local?pathname=${encodeURIComponent(pathname)}`,
    headers: { "content-type": body.contentType, authorization: "Bearer <apparaattoken>" },
    pathname,
    expiresAt: new Date(validUntil).toISOString(),
    finalize: "PUT-response JSON bevat `url`; stuur die als fileUrl naar POST /api/ingest/glasses",
  });
});

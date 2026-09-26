import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSafePathname, orgPrefix } from "@/lib/storage";
import { jsonError, toErrorResponse } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * Vercel Blob client-upload token endpoint. The browser (or service worker)
 * uploads directly to Blob storage — also large videos, in parts — after this
 * route has verified the session and the target path (orgs/<own org>/...).
 */
export async function POST(request: Request) {
  if (!env.blob.enabled) return jsonError(400, "Blob-opslag is niet geconfigureerd.");
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      token: env.blob.token,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession();
        if (session.status !== "ok") throw new Error("Niet ingelogd.");
        if (session.role === "lezer") throw new Error("Geen rechten om te uploaden.");
        if (!isSafePathname(pathname) || !pathname.startsWith(orgPrefix(session.org.id))) throw new Error("Ongeldig uploadpad.");
        await checkRateLimit("upload", session.org.id);
        return {
          allowedContentTypes: ["image/*", "video/*", "audio/*", "application/pdf", "application/json"],
          maximumSizeInBytes: 2 * 1024 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ orgId: session.org.id, userId: session.user.id }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && /Niet ingelogd/.test(err.message)) return jsonError(401, err.message);
    if (err instanceof Error && /(rechten|uploadpad)/.test(err.message)) return jsonError(403, err.message);
    return toErrorResponse(err);
  }
}

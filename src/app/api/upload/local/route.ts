import { NextResponse } from "next/server";
import { jsonError, withSession } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSafePathname, orgPrefix, putObject, storageMode } from "@/lib/storage";

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Local-storage upload (used when Vercel Blob is not configured). */
export const PUT = withSession(async (req, session) => {
  if (storageMode() !== "local") return jsonError(400, "Gebruik de Blob-upload.");
  if (session.role === "lezer") return jsonError(403, "Geen rechten om te uploaden.");
  const pathname = new URL(req.url).searchParams.get("pathname") ?? "";
  if (!isSafePathname(pathname) || !pathname.startsWith(orgPrefix(session.org.id))) return jsonError(403, "Ongeldig uploadpad.");
  await checkRateLimit("upload", session.org.id);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return jsonError(413, "Bestand is te groot.");
  const buf = Buffer.from(await req.arrayBuffer());
  const stored = await putObject(pathname, buf, req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ url: stored.url, size: stored.size });
});

import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices";
import { jsonError, withErrors } from "@/lib/api";
import { isSafePathname, putObject, storageMode } from "@/lib/storage";

/** Local-storage target for large device uploads (when Vercel Blob is not configured). */
export const PUT = withErrors(async (req: Request) => {
  if (storageMode() !== "local") return jsonError(400, "Gebruik de presigned Blob-URL.");
  const auth = await authenticateDevice(req.headers.get("authorization"));
  if (!auth) return jsonError(401, "Ongeldig of ingetrokken apparaattoken.");
  const pathname = new URL(req.url).searchParams.get("pathname") ?? "";
  if (!isSafePathname(pathname) || !pathname.startsWith(`orgs/${auth.ctx.orgId}/ingest/${auth.device.id}/`)) return jsonError(403, "Ongeldig uploadpad.");
  const stored = await putObject(pathname, Buffer.from(await req.arrayBuffer()), req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ url: stored.url, pathname });
});

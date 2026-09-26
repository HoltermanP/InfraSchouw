import "server-only";
import { openObject } from "@/lib/storage";

/** Stream a stored object as an HTTP response (private cache, Range support). */
export async function serveObject(
  url: string,
  req: Request,
  opts: { downloadName?: string; cacheSeconds?: number } = {},
): Promise<Response> {
  const obj = await openObject(url, req.headers.get("range"));
  if (!obj) return new Response("Niet gevonden", { status: 404 });
  const headers = new Headers({
    "Content-Type": obj.contentType,
    "Cache-Control": `private, max-age=${opts.cacheSeconds ?? 3600}`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (obj.contentLength) headers.set("Content-Length", String(obj.contentLength));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  if (opts.downloadName) headers.set("Content-Disposition", `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`);
  return new Response(obj.stream, { status: obj.status, headers });
}

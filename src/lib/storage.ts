import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, put } from "@vercel/blob";
import { env } from "@/lib/env";

/**
 * Media storage abstraction.
 * - Vercel Blob (private store) when BLOB_READ_WRITE_TOKEN is set.
 * - Local filesystem (./.data/uploads) otherwise — stored URLs use `local:`.
 * - Bundled demo assets are referenced as `static:/demo/...` (files in /public).
 * All object pathnames start with `orgs/<orgId>/` so access can be checked per org.
 */

export const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

export function storageMode(): "blob" | "local" {
  return env.blob.enabled ? "blob" : "local";
}

export function orgPrefix(orgId: string) {
  return `orgs/${orgId}/`;
}

/** Extract the storage pathname from a stored URL (blob URL, local: or static:). */
export function pathnameOf(url: string): string {
  if (url.startsWith("local:")) return url.slice("local:".length);
  if (url.startsWith("static:")) return url.slice("static:".length);
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return url;
  }
}

/** True when the stored object belongs to the organisation (or is a shared demo asset). */
export function belongsToOrg(url: string, orgId: string): boolean {
  if (url.startsWith("static:/demo/")) return true;
  return pathnameOf(url).startsWith(orgPrefix(orgId));
}

export function isSafePathname(pathname: string): boolean {
  return /^orgs\/[0-9a-f-]{36}\/[A-Za-z0-9._\-/]+$/.test(pathname) && !pathname.includes("..");
}

function localPath(pathname: string) {
  const full = path.join(LOCAL_ROOT, pathname);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("Ongeldig pad");
  return full;
}

export async function putObject(
  pathname: string,
  data: Buffer | Uint8Array | Blob | ReadableStream | string,
  contentType: string,
): Promise<{ url: string; size: number }> {
  if (!isSafePathname(pathname)) throw new Error(`Ongeldig opslagpad: ${pathname}`);
  if (storageMode() === "blob") {
    const body = data instanceof Uint8Array && !(data instanceof Buffer) ? Buffer.from(data) : data;
    const res = await put(pathname, body as Buffer, {
      access: "private",
      contentType,
      addRandomSuffix: true,
      token: env.blob.token,
    });
    const size = typeof data === "string" ? Buffer.byteLength(data) : data instanceof Blob ? data.size : "byteLength" in data ? data.byteLength : 0;
    return { url: res.url, size };
  }
  const suffix = Math.random().toString(36).slice(2, 10);
  const ext = path.extname(pathname);
  const finalPath = `${pathname.slice(0, pathname.length - ext.length)}-${suffix}${ext}`;
  const full = localPath(finalPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  let buf: Buffer;
  if (typeof data === "string") buf = Buffer.from(data);
  else if (data instanceof Blob) buf = Buffer.from(await data.arrayBuffer());
  else if (data instanceof ReadableStream) buf = Buffer.from(await new Response(data).arrayBuffer());
  else buf = Buffer.from(data);
  await fs.writeFile(full, buf);
  await fs.writeFile(`${full}.meta.json`, JSON.stringify({ contentType }));
  return { url: `local:${finalPath}`, size: buf.byteLength };
}

export type StoredObject = { stream: ReadableStream<Uint8Array>; contentType: string; size: number | null };

export async function getObject(url: string): Promise<StoredObject | null> {
  if (url.startsWith("static:")) {
    const rel = url.slice("static:".length).replace(/^\//, "");
    const full = path.join(process.cwd(), "public", rel);
    if (!full.startsWith(path.join(process.cwd(), "public"))) return null;
    try {
      const stat = await fs.stat(full);
      return {
        stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
        contentType: guessContentType(full),
        size: stat.size,
      };
    } catch {
      return null;
    }
  }
  if (url.startsWith("local:")) {
    const full = localPath(url.slice("local:".length));
    try {
      const stat = await fs.stat(full);
      let contentType = guessContentType(full);
      try {
        contentType = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")).contentType ?? contentType;
      } catch {
        /* no meta file */
      }
      return { stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>, contentType, size: stat.size };
    } catch {
      return null;
    }
  }
  if (!env.blob.enabled) return null;
  const res = await get(url, { access: "private", token: env.blob.token });
  if (!res || !res.stream) return null;
  return { stream: res.stream as ReadableStream<Uint8Array>, contentType: res.blob.contentType ?? "application/octet-stream", size: res.blob.size };
}

export async function getObjectBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const obj = await getObject(url);
  if (!obj) return null;
  return { buffer: Buffer.from(await new Response(obj.stream).arrayBuffer()), contentType: obj.contentType };
}

export async function deleteObject(url: string | null | undefined) {
  if (!url || url.startsWith("static:")) return;
  if (url.startsWith("local:")) {
    const full = localPath(url.slice("local:".length));
    await fs.rm(full, { force: true });
    await fs.rm(`${full}.meta.json`, { force: true });
    return;
  }
  if (env.blob.enabled) await del(url, { token: env.blob.token });
}

export function guessContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".m4a": "audio/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".pdf": "application/pdf",
      ".json": "application/json",
      ".geojson": "application/geo+json",
      ".zip": "application/zip",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[ext] ?? "application/octet-stream"
  );
}

export function extensionFor(mime: string | null | undefined): string {
  if (!mime) return "bin";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "application/pdf": "pdf",
  };
  return map[mime.split(";")[0]!.trim()] ?? "bin";
}

export type RangedObject = StoredObject & { status: 200 | 206; contentRange: string | null; contentLength: number | null };

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : NaN;
  if (Number.isNaN(start)) {
    start = size - end;
    end = size - 1;
  } else if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start < 0 || start > end || start >= size) return null;
  return { start, end };
}

/** Open an object with optional HTTP Range support (needed for video/audio seeking, esp. Safari). */
export async function openObject(url: string, range: string | null): Promise<RangedObject | null> {
  if (url.startsWith("local:") || url.startsWith("static:")) {
    const full = url.startsWith("local:")
      ? localPath(url.slice("local:".length))
      : path.join(process.cwd(), "public", url.slice("static:".length).replace(/^\//, ""));
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      return null;
    }
    let contentType = guessContentType(full);
    if (url.startsWith("local:")) {
      try {
        contentType = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")).contentType ?? contentType;
      } catch {
        /* no meta */
      }
    }
    const r = parseRange(range, stat.size);
    if (r) {
      return {
        stream: Readable.toWeb(createReadStream(full, { start: r.start, end: r.end })) as ReadableStream<Uint8Array>,
        contentType,
        size: stat.size,
        status: 206,
        contentRange: `bytes ${r.start}-${r.end}/${stat.size}`,
        contentLength: r.end - r.start + 1,
      };
    }
    return {
      stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
      contentType,
      size: stat.size,
      status: 200,
      contentRange: null,
      contentLength: stat.size,
    };
  }
  if (!env.blob.enabled) return null;
  const res = await get(url, { access: "private", token: env.blob.token, headers: range ? { range } : undefined });
  if (!res || !res.stream) return null;
  const contentRange = res.headers.get("content-range");
  return {
    stream: res.stream,
    contentType: res.blob.contentType ?? "application/octet-stream",
    size: res.blob.size,
    status: contentRange ? 206 : 200,
    contentRange,
    contentLength: Number(res.headers.get("content-length")) || null,
  };
}

import { upload } from "@vercel/blob/client";

/**
 * Uploads a file to media storage. In production this is a Vercel Blob
 * client upload (private access, multipart for large files so interrupted
 * uploads retry per part). Without Blob configured, files are PUT to the
 * local storage route. Works in window and service-worker contexts.
 */

export type UploadMode = "blob" | "local";

let cachedMode: { mode: UploadMode; at: number } | null = null;

export async function getUploadMode(origin: string, fetchImpl: typeof fetch = fetch): Promise<UploadMode> {
  if (cachedMode && Date.now() - cachedMode.at < 10 * 60_000) return cachedMode.mode;
  const res = await fetchImpl(`${origin}/api/upload/config`, { credentials: "include" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Uploadconfiguratie niet beschikbaar (${res.status})`);
  const data = (await res.json()) as { mode: UploadMode };
  cachedMode = { mode: data.mode, at: Date.now() };
  return data.mode;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Niet ingelogd — log opnieuw in om te synchroniseren.");
    this.name = "UnauthorizedError";
  }
}

const MULTIPART_THRESHOLD = 8 * 1024 * 1024;

export async function uploadFile(
  origin: string,
  file: { blob: Blob; pathname: string; mime: string },
  onProgress?: (pct: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const mode = await getUploadMode(origin, fetchImpl);
  if (mode === "blob") {
    const result = await upload(file.pathname, file.blob, {
      access: "private",
      handleUploadUrl: `${origin}/api/upload`,
      contentType: file.mime,
      multipart: file.blob.size > MULTIPART_THRESHOLD,
      onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
    });
    return result.url;
  }
  const res = await fetchImpl(`${origin}/api/upload/local?pathname=${encodeURIComponent(file.pathname)}`, {
    method: "PUT",
    body: file.blob,
    headers: { "Content-Type": file.mime || "application/octet-stream" },
    credentials: "include",
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ? `${detail} (${res.status})` : `Upload mislukt (${res.status})`);
  }
  const data = (await res.json()) as { url: string };
  onProgress?.(100);
  return data.url;
}

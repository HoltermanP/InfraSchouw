/** Browser-side media helpers (thumbnails, keyframes, recorder formats). */

export function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("Afbeelding maken mislukt"))), type, quality),
  );
}

/**
 * Downscale a camera photo for storage and upload (full sensor photos are
 * often 10+ MB, which makes uploads over mobile data slow and fragile).
 * Keeps the original when it is already small or cannot be decoded.
 */
export async function optimizePhoto(blob: Blob, maxDim = 3200, quality = 0.85): Promise<{ blob: Blob; mime: string }> {
  const keep = { blob, mime: blob.type || "image/jpeg" };
  if (blob.size < 2.5 * 1024 * 1024) return keep;
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await canvasToBlob(canvas, "image/jpeg", quality);
    return out.size < blob.size ? { blob: out, mime: "image/jpeg" } : keep;
  } catch {
    return keep;
  }
}

/** Scaled JPEG thumbnail (max side `max` px), respecting EXIF orientation. */
export async function makeThumbnail(blob: Blob, max = 480, quality = 0.78): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const out = await canvasToBlob(canvas, "image/jpeg", quality);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close();
  return { blob: out, ...dims };
}

/** Extract JPEG keyframes from a recorded video every `everySeconds` (max `limit`). */
export async function extractVideoKeyframes(video: Blob, everySeconds = 5, limit = 24): Promise<{ blob: Blob; offsetMs: number }[]> {
  const url = URL.createObjectURL(video);
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error("Video kan niet worden gelezen"));
    });
    // MediaRecorder webm files often report Infinity duration until seeked to the end.
    if (!Number.isFinite(el.duration)) {
      el.currentTime = 1e9;
      await new Promise((r) => (el.ontimeupdate = r));
      el.ontimeupdate = null;
    }
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    const canvas = document.createElement("canvas");
    const frames: { blob: Blob; offsetMs: number }[] = [];
    for (let t = 0; t <= duration && frames.length < limit; t += everySeconds) {
      el.currentTime = Math.min(t, Math.max(0, duration - 0.05));
      await new Promise((r) => (el.onseeked = r));
      const scale = Math.min(1, 1280 / Math.max(el.videoWidth, el.videoHeight || 1));
      canvas.width = Math.round(el.videoWidth * scale);
      canvas.height = Math.round(el.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
      frames.push({ blob: await canvasToBlob(canvas, "image/jpeg", 0.8), offsetMs: Math.round(t * 1000) });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickRecorderMime(kind: "audio" | "video"): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
      : ["video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

export function extFromMime(mime: string): string {
  const base = mime.split(";")[0]!.trim();
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
    }[base] ?? "bin"
  );
}

/** Duration of an audio/video blob in ms (best effort). */
export async function mediaDurationMs(blob: Blob): Promise<number | null> {
  const url = URL.createObjectURL(blob);
  try {
    const el = document.createElement(blob.type.startsWith("video") ? "video" : "audio");
    el.preload = "metadata";
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject();
    });
    if (!Number.isFinite(el.duration)) {
      el.currentTime = 1e9;
      await new Promise((r) => (el.ontimeupdate = r));
    }
    return Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function vibrate(pattern: number | number[] = 60) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

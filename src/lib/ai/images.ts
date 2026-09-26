import "server-only";
import sharp from "sharp";
import { getObjectBuffer } from "@/lib/storage";

/** Load a stored image, downscale for the vision model and return a data URL. */
export async function imageDataUrl(storedUrl: string, maxDim = 1600): Promise<string | null> {
  const obj = await getObjectBuffer(storedUrl);
  if (!obj) return null;
  try {
    const out = await sharp(obj.buffer).rotate().resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    if (!obj.contentType.startsWith("image/")) return null;
    return `data:${obj.contentType};base64,${obj.buffer.toString("base64")}`;
  }
}

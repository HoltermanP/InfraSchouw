import exifr from "exifr";

export type ExifInfo = {
  lat: number | null;
  lon: number | null;
  heading: number | null;
  takenAt: Date | null;
  make: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  raw: Record<string, unknown>;
};

const PICK = [
  "latitude",
  "longitude",
  "GPSImgDirection",
  "DateTimeOriginal",
  "CreateDate",
  "OffsetTimeOriginal",
  "Make",
  "Model",
  "ExifImageWidth",
  "ExifImageHeight",
  "ImageWidth",
  "ImageHeight",
  "Orientation",
  "LensModel",
];

function serializable(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

/** Read GPS, direction and capture time from a photo (browser or Node). */
export async function readExif(input: Blob | ArrayBuffer | Uint8Array): Promise<ExifInfo | null> {
  try {
    const data = (await exifr.parse(input as ArrayBuffer, {
      gps: true,
      tiff: true,
      exif: true,
      pick: PICK,
      reviveValues: true,
    })) as Record<string, unknown> | undefined;
    if (!data) return null;
    const lat = typeof data.latitude === "number" && Number.isFinite(data.latitude) ? data.latitude : null;
    const lon = typeof data.longitude === "number" && Number.isFinite(data.longitude) ? data.longitude : null;
    const taken = (data.DateTimeOriginal ?? data.CreateDate) as Date | string | undefined;
    const takenAt = taken instanceof Date ? taken : typeof taken === "string" ? new Date(taken) : null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      lat,
      lon,
      heading: num(data.GPSImgDirection),
      takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
      make: typeof data.Make === "string" ? data.Make : null,
      model: typeof data.Model === "string" ? data.Model : null,
      width: num(data.ExifImageWidth) ?? num(data.ImageWidth),
      height: num(data.ExifImageHeight) ?? num(data.ImageHeight),
      raw: serializable(data),
    };
  } catch {
    return null;
  }
}

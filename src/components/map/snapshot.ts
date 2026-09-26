import type { Map as MlMap } from "maplibre-gl";
import { PRIORITY_COLORS, type Priority } from "@/lib/domain";

/**
 * Snapshot of the current MapLibre view as PNG, with numbered photo
 * locations and finding markers drawn on top (HTML markers are not part of
 * the WebGL canvas).
 */
export async function mapSnapshot(
  map: MlMap,
  captures: { lat: number; lon: number; seq: number | null }[],
  findings: { lat: number; lon: number; priority: Priority }[],
): Promise<Blob> {
  const src = map.getCanvas();
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const ratio = src.width / src.clientWidth;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of findings) {
    const p = map.project([f.lon, f.lat]);
    ctx.fillStyle = PRIORITY_COLORS[f.priority];
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(p.x * ratio, p.y * ratio);
    ctx.arc(p.x * ratio, (p.y - 14) * ratio, 9 * ratio, Math.PI * 0.8, Math.PI * 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${11 * ratio}px system-ui`;
    ctx.fillText("!", p.x * ratio, (p.y - 14) * ratio);
  }
  for (const c of captures) {
    const p = map.project([c.lon, c.lat]);
    ctx.fillStyle = "#0f4c81";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.arc(p.x * ratio, p.y * ratio, 10 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${10 * ratio}px system-ui`;
    ctx.fillText(String(c.seq ?? "•"), p.x * ratio, p.y * ratio);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Snapshot mislukt"))), "image/png"));
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Circle, Eraser, MoveHorizontal, Pencil, Square, Type, Undo2, Grid2x2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnnotationDrawing, AnnotationShape } from "@/db/schema";

type Tool = "arrow" | "circle" | "rect" | "text" | "freehand" | "dimension" | "blur";
const TOOLS: { tool: Tool; label: string; icon: typeof Pencil }[] = [
  { tool: "arrow", label: "Pijl", icon: ArrowUpRight },
  { tool: "circle", label: "Cirkel", icon: Circle },
  { tool: "rect", label: "Rechthoek", icon: Square },
  { tool: "text", label: "Tekst", icon: Type },
  { tool: "freehand", label: "Vrij tekenen", icon: Pencil },
  { tool: "dimension", label: "Maatlijn", icon: MoveHorizontal },
  { tool: "blur", label: "Vervagen (AVG)", icon: Grid2x2 },
];
const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#0ea5e9", "#ffffff", "#111827"];

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - Math.PI / 7), y2 - size * Math.sin(a - Math.PI / 7));
  ctx.lineTo(x2 - size * Math.cos(a + Math.PI / 7), y2 - size * Math.sin(a + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function pixelate(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const rx = Math.round(Math.min(x, x + w));
  const ry = Math.round(Math.min(y, y + h));
  const rw = Math.max(1, Math.round(Math.abs(w)));
  const rh = Math.max(1, Math.round(Math.abs(h)));
  const block = Math.max(8, Math.round(Math.max(rw, rh) / 12));
  const tmp = document.createElement("canvas");
  tmp.width = Math.max(1, Math.ceil(rw / block));
  tmp.height = Math.max(1, Math.ceil(rh / block));
  const t = tmp.getContext("2d")!;
  t.imageSmoothingEnabled = true;
  t.drawImage(img, rx, ry, rw, rh, 0, 0, tmp.width, tmp.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, rx, ry, rw, rh);
  ctx.restore();
}

/** Render a drawing onto a canvas (image + shapes). Exported for server-less re-rendering. */
export function renderDrawing(ctx: CanvasRenderingContext2D, img: CanvasImageSource | null, drawing: AnnotationDrawing) {
  const { width, height } = drawing;
  ctx.clearRect(0, 0, width, height);
  if (img) ctx.drawImage(img, 0, 0, width, height);
  else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  const base = Math.max(width, height) / 400;
  // Blur regions first, based on the original image.
  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  snapshot.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  for (const s of drawing.shapes) if (s.kind === "blur") pixelate(ctx, snapshot, s.x, s.y, s.w, s.h);
  for (const s of drawing.shapes) {
    if (s.kind === "blur") continue;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if ("width" in s) ctx.lineWidth = s.width * base;
    switch (s.kind) {
      case "arrow":
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        drawArrowHead(ctx, s.x1, s.y1, s.x2, s.y2, 6 * s.width * base);
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, Math.abs(s.r), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "rect":
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        break;
      case "freehand":
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
        break;
      case "text": {
        ctx.font = `600 ${s.size * base}px system-ui`;
        ctx.lineWidth = 3 * base;
        ctx.strokeStyle = s.color === "#111827" ? "#ffffff" : "#111827";
        ctx.strokeText(s.text, s.x, s.y);
        ctx.fillText(s.text, s.x, s.y);
        break;
      }
      case "dimension": {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        const size = 5 * s.width * base;
        drawArrowHead(ctx, s.x1, s.y1, s.x2, s.y2, size);
        drawArrowHead(ctx, s.x2, s.y2, s.x1, s.y1, size);
        if (s.label) {
          const mx = (s.x1 + s.x2) / 2;
          const my = (s.y1 + s.y2) / 2;
          ctx.font = `700 ${16 * base}px system-ui`;
          const w = ctx.measureText(s.label).width;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(mx - w / 2 - 4 * base, my - 12 * base, w + 8 * base, 22 * base);
          ctx.fillStyle = s.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(s.label, mx, my);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
        break;
      }
    }
  }
}

export type AnnotationResult = { drawing: AnnotationDrawing; rendered: Blob };

export function AnnotationEditor({
  imageSrc,
  initial,
  blankSize = { width: 1600, height: 1200 },
  onSave,
  onCancel,
  saveLabel = "Opslaan",
  defaultTool = "arrow",
}: {
  imageSrc?: string | null;
  initial?: AnnotationDrawing | null;
  blankSize?: { width: number; height: number };
  onSave: (r: AnnotationResult) => void | Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
  defaultTool?: Tool;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(imageSrc ? null : blankSize);
  const [shapes, setShapes] = useState<AnnotationShape[]>(initial?.shapes ?? []);
  const [draft, setDraft] = useState<AnnotationShape | null>(null);
  const [tool, setTool] = useState<Tool>(defaultTool);
  const [color, setColor] = useState(COLORS[0]!);
  const [lineWidth, setLineWidth] = useState(3);
  const [saving, setSaving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!imageSrc) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      setImg(i);
      setSize({ width: i.naturalWidth, height: i.naturalHeight });
    };
    i.src = imageSrc;
  }, [imageSrc]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    canvas.width = size.width;
    canvas.height = size.height;
    renderDrawing(canvas.getContext("2d")!, img, { ...size, shapes: draft ? [...shapes, draft] : shapes });
  }, [img, size, shapes, draft]);
  useEffect(redraw, [redraw]);

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * size!.width, y: ((e.clientY - rect.top) / rect.height) * size!.height };
  };

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!size) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    start.current = p;
    if (tool === "text") {
      const t = window.prompt("Tekst");
      if (t) setShapes((s) => [...s, { kind: "text", x: p.x, y: p.y, text: t, color, size: 22 }]);
      start.current = null;
      return;
    }
    if (tool === "freehand") setDraft({ kind: "freehand", points: [[p.x, p.y]], color, width: lineWidth });
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = start.current;
    if (!s || !size) return;
    const p = toImage(e);
    switch (tool) {
      case "arrow":
        setDraft({ kind: "arrow", x1: s.x, y1: s.y, x2: p.x, y2: p.y, color, width: lineWidth });
        break;
      case "dimension":
        setDraft({ kind: "dimension", x1: s.x, y1: s.y, x2: p.x, y2: p.y, label: "", color, width: lineWidth });
        break;
      case "circle":
        setDraft({ kind: "circle", cx: s.x, cy: s.y, r: Math.hypot(p.x - s.x, p.y - s.y), color, width: lineWidth });
        break;
      case "rect":
        setDraft({ kind: "rect", x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y, color, width: lineWidth });
        break;
      case "blur":
        setDraft({ kind: "blur", x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y });
        break;
      case "freehand":
        setDraft((d) => (d && d.kind === "freehand" ? { ...d, points: [...d.points, [p.x, p.y]] } : d));
        break;
    }
  }
  function onUp() {
    if (draft) {
      let final = draft;
      if (final.kind === "dimension") {
        const label = window.prompt("Maat (bijv. 72 cm)") ?? "";
        final = { ...final, label };
      }
      setShapes((s) => [...s, final]);
    }
    setDraft(null);
    start.current = null;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    setSaving(true);
    try {
      renderDrawing(canvas.getContext("2d")!, img, { ...size, shapes });
      const rendered = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Opslaan mislukt"))), "image/jpeg", 0.9));
      await onSave({ drawing: { ...size, shapes }, rendered });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 bg-neutral-900 p-2 text-white">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Tekengereedschap">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            onClick={() => setTool(t.tool)}
            aria-pressed={tool === t.tool}
            title={t.label}
            className={cn("flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-xs", tool === t.tool ? "bg-amber-400 text-black" : "bg-white/10")}
          >
            <t.icon className="size-5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        <span className="mx-1 h-8 w-px bg-white/20" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Kleur ${c}`}
            onClick={() => setColor(c)}
            className={cn("size-8 rounded-full border-2", color === c ? "border-amber-400" : "border-white/30")}
            style={{ background: c }}
          />
        ))}
        <input type="range" min={1} max={8} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} aria-label="Lijndikte" className="w-20" />
        <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10" aria-label="Ongedaan maken">
          <Undo2 className="size-5" />
        </button>
        <button type="button" onClick={() => setShapes([])} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/10" aria-label="Alles wissen">
          <Eraser className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {size ? (
          <canvas
            ref={canvasRef}
            data-testid="annotation-canvas"
            className="max-h-full max-w-full touch-none bg-white"
            style={{ aspectRatio: `${size.width} / ${size.height}` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        ) : (
          <p className="text-sm text-white/70">Foto laden…</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} className="min-h-11">
          Annuleren
        </Button>
        <Button onClick={save} disabled={saving || !size} className="min-h-11 bg-amber-400 text-black hover:bg-amber-300">
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

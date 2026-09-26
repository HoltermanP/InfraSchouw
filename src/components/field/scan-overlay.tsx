"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Detected = { text: string; format: string };

/**
 * QR/barcode scanner: native BarcodeDetector where available, otherwise
 * @zxing/browser. Used for station numbers, asset labels and cable drums.
 */
export function ScanOverlay({ onResult, onClose }: { onResult: (r: Detected) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    (async () => {
      const Detector = (globalThis as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => { detect(src: CanvasImageSource): Promise<{ rawValue: string; format: string }[]> } }).BarcodeDetector;
      try {
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
          video.current!.srcObject = stream;
          await video.current!.play();
          const detector = new Detector();
          while (!stopped) {
            const codes = await detector.detect(video.current!).catch(() => []);
            if (codes.length) {
              onResult({ text: codes[0]!.rawValue, format: codes[0]!.format });
              return;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromVideoDevice(undefined, video.current!, (result) => {
            if (result && !stopped) {
              stopped = true;
              zxingControls?.stop();
              onResult({ text: result.getText(), format: String(result.getBarcodeFormat()) });
            }
          });
        }
      } catch (err) {
        setError(`Scanner kon niet starten (${(err as Error).message}). Voer de code handmatig in.`);
      }
    })();
    return () => {
      stopped = true;
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="QR- of barcode scannen">
      <div className="flex items-center justify-between p-3">
        <h2 className="text-lg font-bold">Scan QR / barcode</h2>
        <button type="button" onClick={onClose} className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white/15" aria-label="Sluiten">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={video} className="h-full w-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-1/4 rounded-2xl border-4 border-amber-400" />
      </div>
      {error ? <p className="bg-red-700 p-3 text-sm">{error}</p> : null}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onResult({ text: manual.trim(), format: "handmatig" });
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Of typ de code" aria-label="Code handmatig" className="min-h-12 flex-1 rounded-xl bg-white/15 px-3" />
        <button type="submit" className="min-h-12 rounded-xl bg-amber-400 px-4 font-semibold text-black">
          Vastleggen
        </button>
      </form>
    </div>
  );
}

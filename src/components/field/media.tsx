"use client";

import { useEffect, useState } from "react";
import { getLocalDb, type LocalCapture } from "@/lib/offline/db";

/**
 * Preview URL for a capture: the local blob while it is still in IndexedDB
 * (also offline), otherwise the authorised server media route.
 */
export function useCaptureUrl(capture: Pick<LocalCapture, "id" | "fileId" | "thumbFileId" | "status"> | null, variant: "thumb" | "orig" = "thumb") {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!capture) return;
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      const fileId = variant === "thumb" ? (capture.thumbFileId ?? capture.fileId) : capture.fileId;
      const file = fileId ? await getLocalDb().files.get(fileId) : undefined;
      if (cancelled) return;
      if (file) {
        revoke = URL.createObjectURL(file.blob);
        setUrl(revoke);
      } else {
        setUrl(`/api/media/${capture.id}?v=${variant}`);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [capture, variant]);
  return url;
}

export function CaptureThumb({ capture, className }: { capture: LocalCapture; className?: string }) {
  const url = useCaptureUrl(capture);
  if (capture.type === "note" || capture.type === "measurement" || capture.type === "scan" || capture.type === "audio") {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 p-1 text-center text-[10px] leading-tight text-white/90 ${className ?? ""}`}>
        {capture.type === "audio" ? "🎙 Spraak" : (capture.textContent ?? capture.type).slice(0, 60)}
      </div>
    );
  }
  return url ? <img src={url} alt="" className={`object-cover ${className ?? ""}`} /> : <div className={`bg-neutral-800 ${className ?? ""}`} />;
}

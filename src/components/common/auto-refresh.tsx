"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the server component tree periodically (e.g. while AI jobs run). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

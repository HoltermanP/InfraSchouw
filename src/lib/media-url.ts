/** URLs for authorised media (client + server). */
export function captureUrl(id: string, variant: "orig" | "thumb" | "annotated" | `kf${number}` = "orig", shareToken?: string | null) {
  const p = new URLSearchParams({ v: variant });
  if (shareToken) p.set("s", shareToken);
  return `/api/media/${id}?${p}`;
}

export function fileUrl(stored: string | null | undefined, name?: string) {
  if (!stored) return null;
  if (stored.startsWith("static:")) return stored.slice("static:".length);
  const p = new URLSearchParams({ u: stored });
  if (name) p.set("name", name);
  return `/api/files?${p}`;
}

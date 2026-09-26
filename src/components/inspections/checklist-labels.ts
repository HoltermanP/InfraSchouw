/** Display label for a checklist answer value (shared by UI and exports). */
export function answerLabel(v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v === "ja") return "Ja";
  if (v === "nee") return "Nee";
  if (v === "nvt") return "N.v.t.";
  return String(v);
}

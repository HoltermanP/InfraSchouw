import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "d MMM yyyy", { locale: nl });
}
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "d MMM yyyy HH:mm", { locale: nl });
}
export function fmtTime(d: Date | string | null | undefined, seconds = false): string {
  if (!d) return "—";
  return format(new Date(d), seconds ? "HH:mm:ss" : "HH:mm", { locale: nl });
}
export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatDistanceToNow(new Date(d), { locale: nl, addSuffix: true });
}
export function fmtCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v);
}
export function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: digits }).format(v);
}
export function fmtDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "—";
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

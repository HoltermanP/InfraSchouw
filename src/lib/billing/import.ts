import { z } from "zod";

export const billingItemSchema = z.object({
  code: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(20),
  unitPrice: z.number().finite().min(0),
  plannedQuantity: z.number().finite().min(0),
});
export type BillingItemInput = z.infer<typeof billingItemSchema>;

/** Parse Dutch or international number notation: "1.234,56", "1234.56", "€ 38,50". */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[€\s]/g, "").trim();
  if (!s) return null;
  if (/,\d{1,3}$/.test(s) && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const HEADERS: Record<keyof BillingItemInput, RegExp> = {
  code: /^(post(code|nr|nummer)?|code|nr\.?|nummer|bestekpost)$/i,
  description: /^(omschrijving|beschrijving|description|tekst)$/i,
  unit: /^(eenheid|eh|unit)$/i,
  unitPrice: /^(eenheidsprijs|prijs|tarief|unit ?price|€\/eh)$/i,
  plannedQuantity: /^(hoeveelheid|gepland|geplande hoeveelheid|aantal|qty|raming)$/i,
};

export type ParseResult = { items: BillingItemInput[]; errors: { row: number; message: string }[] };

/** Rows (first row = header) from Excel or CSV → validated billing items. */
export function parseBillingRows(rows: unknown[][]): ParseResult {
  const errors: ParseResult["errors"] = [];
  const headerIdx = rows.findIndex((r) => r.some((c) => HEADERS.code.test(String(c ?? "").trim())));
  if (headerIdx < 0) return { items: [], errors: [{ row: 1, message: "Geen kopregel gevonden (verwacht o.a. kolommen ‘postcode’, ‘omschrijving’, ‘eenheid’, ‘eenheidsprijs’, ‘hoeveelheid’)." }] };
  const header = rows[headerIdx]!.map((c) => String(c ?? "").trim());
  const col = Object.fromEntries(
    (Object.keys(HEADERS) as (keyof BillingItemInput)[]).map((k) => [k, header.findIndex((h) => HEADERS[k].test(h))]),
  ) as Record<keyof BillingItemInput, number>;
  const missing = (Object.keys(col) as (keyof BillingItemInput)[]).filter((k) => col[k] < 0);
  if (missing.length) return { items: [], errors: [{ row: headerIdx + 1, message: `Kolom(men) ontbreken: ${missing.join(", ")}` }] };
  const items: BillingItemInput[] = [];
  const seen = new Set<string>();
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const rowNr = headerIdx + i + 2;
    if (r.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const candidate = {
      code: String(r[col.code] ?? "").trim(),
      description: String(r[col.description] ?? "").trim(),
      unit: String(r[col.unit] ?? "").trim(),
      unitPrice: parseNumber(r[col.unitPrice]) ?? NaN,
      plannedQuantity: parseNumber(r[col.plannedQuantity]) ?? 0,
    };
    const parsed = billingItemSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row: rowNr, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      return;
    }
    if (seen.has(parsed.data.code)) {
      errors.push({ row: rowNr, message: `Postcode ${parsed.data.code} komt dubbel voor` });
      return;
    }
    seen.add(parsed.data.code);
    items.push(parsed.data);
  });
  return { items, errors };
}

/** Minimal CSV parser (; or , separated, quoted fields). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export type BillingOverviewRow = {
  id: string;
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  planned: number;
  demonstrated: number;
  proposed: number;
  difference: number;
  plannedAmount: number;
  demonstratedAmount: number;
};

/** Planned vs demonstrated (confirmed evidence) per billing item. */
export function billingOverview(
  items: { id: string; code: string; description: string; unit: string; unitPrice: number; plannedQuantity: number }[],
  evidence: { billingItemId: string; quantity: number; status: "voorgesteld" | "bevestigd" | "afgewezen" }[],
): { rows: BillingOverviewRow[]; totals: { planned: number; demonstrated: number; difference: number } } {
  const rows = items.map((it) => {
    const ev = evidence.filter((e) => e.billingItemId === it.id);
    const demonstrated = ev.filter((e) => e.status === "bevestigd").reduce((n, e) => n + e.quantity, 0);
    const proposed = ev.filter((e) => e.status === "voorgesteld").reduce((n, e) => n + e.quantity, 0);
    return {
      id: it.id,
      code: it.code,
      description: it.description,
      unit: it.unit,
      unitPrice: it.unitPrice,
      planned: it.plannedQuantity,
      demonstrated,
      proposed,
      difference: demonstrated - it.plannedQuantity,
      plannedAmount: it.plannedQuantity * it.unitPrice,
      demonstratedAmount: demonstrated * it.unitPrice,
    };
  });
  const planned = rows.reduce((n, r) => n + r.plannedAmount, 0);
  const demonstrated = rows.reduce((n, r) => n + r.demonstratedAmount, 0);
  return { rows, totals: { planned, demonstrated, difference: demonstrated - planned } };
}

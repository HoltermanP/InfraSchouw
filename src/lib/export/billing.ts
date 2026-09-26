import "server-only";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { organizations, projects } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import { projectBilling } from "@/db/queries/billing";
import { BILLING_EVIDENCE_STATUS_LABELS } from "@/lib/domain";
import { resolveOrgSettings } from "@/lib/org-settings";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { getObjectBuffer } from "@/lib/storage";
import { addSheet } from "./xlsx";
import { renderSimplePdf } from "./pdf";
import type { Block, PhotoRef } from "./model";

async function header(ctx: OrgCtx, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  if (!project || project.orgId !== ctx.orgId) return null;
  return { project, settings: resolveOrgSettings(org?.settings), orgName: org!.name };
}

/** Excel afrekenonderbouwing: overview per item + all evidence with photo numbers and dates. */
export async function renderBillingXlsx(ctx: OrgCtx, projectId: string): Promise<{ buffer: Buffer; name: string } | null> {
  const h = await header(ctx, projectId);
  if (!h) return null;
  const billing = await projectBilling(ctx, projectId);
  const wb = new ExcelJS.Workbook();
  wb.creator = "InfraSchouw";
  const primary = h.settings.branding.primaryColor;
  const ws = addSheet(
    wb,
    "Overzicht",
    [
      { header: "Post", key: "code", width: 10 },
      { header: "Omschrijving", key: "desc", width: 50 },
      { header: "Eenheid", key: "unit", width: 8 },
      { header: "Eenheidsprijs", key: "price", width: 14, numFmt: "€ #,##0.00" },
      { header: "Gepland", key: "planned", width: 12, numFmt: "#,##0.###" },
      { header: "Aangetoond (bevestigd)", key: "demo", width: 14, numFmt: "#,##0.###" },
      { header: "Voorgesteld", key: "prop", width: 12, numFmt: "#,##0.###" },
      { header: "Verschil", key: "diff", width: 12, numFmt: "#,##0.###" },
      { header: "Bedrag gepland", key: "pa", width: 16, numFmt: "€ #,##0.00" },
      { header: "Bedrag aangetoond", key: "da", width: 16, numFmt: "€ #,##0.00" },
    ],
    billing.overview.rows.map((r) => ({ code: r.code, desc: r.description, unit: r.unit, price: r.unitPrice, planned: r.planned, demo: r.demonstrated, prop: r.proposed, diff: r.difference, pa: r.plannedAmount, da: r.demonstratedAmount })),
    primary,
  );
  const last = ws.rowCount + 1;
  const total = ws.addRow({ desc: "Totaal", pa: { formula: `SUM(I2:I${last - 1})` }, da: { formula: `SUM(J2:J${last - 1})` } });
  total.font = { bold: true };
  addSheet(
    wb,
    "Onderbouwing",
    [
      { header: "Post", key: "code", width: 10 },
      { header: "Omschrijving", key: "desc", width: 44 },
      { header: "Hoeveelheid", key: "qty", width: 12, numFmt: "#,##0.###" },
      { header: "Eenheid", key: "unit", width: 8 },
      { header: "Bedrag", key: "amount", width: 14, numFmt: "€ #,##0.00" },
      { header: "Status", key: "status", width: 12 },
      { header: "Schouw", key: "insp", width: 40 },
      { header: "Schouwdatum", key: "date", width: 14 },
      { header: "Fotonummers", key: "photos", width: 16 },
      { header: "Toelichting", key: "remark", width: 40 },
      { header: "Bron", key: "source", width: 10 },
    ],
    billing.evidence.map((r) => ({
      code: r.item.code,
      desc: r.item.description,
      qty: r.e.quantity,
      unit: r.item.unit,
      amount: r.e.quantity * r.item.unitPrice,
      status: BILLING_EVIDENCE_STATUS_LABELS[r.e.status],
      insp: r.inspection.title,
      date: fmtDate(r.inspection.startedAt),
      photos: r.photos.map((p) => p.seq).filter(Boolean).join(", "),
      remark: r.e.remark ?? "",
      source: r.e.source,
    })),
    primary,
  );
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), name: `Afrekenonderbouwing ${h.project.number}.xlsx` };
}

/** PDF appendix: evidence photos per billing item. */
export async function renderBillingPdf(ctx: OrgCtx, projectId: string): Promise<{ buffer: Buffer; name: string } | null> {
  const h = await header(ctx, projectId);
  if (!h) return null;
  const billing = await projectBilling(ctx, projectId);
  const sections: { title: string; blocks: Block[] }[] = [];
  for (const item of billing.overview.rows) {
    const ev = billing.evidence.filter((r) => r.item.id === item.id && r.e.status !== "afgewezen");
    if (ev.length === 0) continue;
    const blocks: Block[] = [
      {
        type: "table",
        columns: ["Schouw", "Datum", "Hoeveelheid", "Bedrag", "Status", "Foto's"],
        widths: [36, 12, 14, 14, 12, 12],
        rows: ev.map((r) => [r.inspection.title, fmtDate(r.inspection.startedAt), `${fmtNumber(r.e.quantity)} ${item.unit}`, fmtCurrency(r.e.quantity * item.unitPrice), BILLING_EVIDENCE_STATUS_LABELS[r.e.status], r.photos.map((p) => p.seq).filter(Boolean).join(", ")]),
      },
    ];
    const photos: PhotoRef[] = [];
    for (const r of ev) {
      for (const p of r.photos) {
        if (!p.capture?.blobUrl) continue;
        const obj = await getObjectBuffer(p.capture.blobUrl);
        if (!obj) continue;
        const out = await sharp(obj.buffer).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer({ resolveWithObject: true }).catch(() => null);
        if (!out) continue;
        photos.push({
          captureId: p.id,
          nr: p.seq,
          caption: `${r.inspection.title}`,
          meta: `${fmtDate(p.capture.capturedAt)}${p.capture.rdX ? ` · RD ${Math.round(p.capture.rdX)}, ${Math.round(p.capture.rdY!)}` : ""}`,
          image: { data: out.data, format: "jpg", width: out.info.width, height: out.info.height },
        });
      }
    }
    if (photos.length) blocks.push({ type: "photoGrid", photos, caption: "" });
    else blocks.push({ type: "note", text: "Geen bewijsfoto's gekoppeld." });
    sections.push({ title: `${item.code} — ${item.description} (aangetoond ${fmtNumber(item.demonstrated)} ${item.unit})`, blocks });
  }
  if (sections.length === 0) sections.push({ title: "Geen bewijs", blocks: [{ type: "note", text: "Er is nog geen afrekenbewijs vastgelegd." }] });
  const b = h.settings.branding;
  const buffer = await renderSimplePdf({
    title: `Bijlage afrekenonderbouwing ${h.project.number}`,
    subtitle: `${h.project.name} · opgesteld ${fmtDate(new Date())} · bewijsfoto's per afrekenpost`,
    branding: { companyName: b.companyName || h.orgName, primaryColor: b.primaryColor, accentColor: b.accentColor, footerText: b.footerText, logo: null },
    sections,
  });
  return { buffer, name: `Bewijsfoto's afrekening ${h.project.number}.pdf` };
}

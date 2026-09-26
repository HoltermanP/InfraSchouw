"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/db/client";
import { billingEvidence, billingItems, captures, inspections, projects } from "@/db/schema";
import { orgWhere, scoped, ForbiddenError } from "@/db/scope";
import { audit, diffFields } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { billingItemSchema, parseBillingRows, parseCsv, type BillingItemInput } from "@/lib/billing/import";
import { roleAtLeast, BILLING_EVIDENCE_STATUSES } from "@/lib/domain";

function revalidateBilling(projectId: string, inspectionId?: string) {
  revalidatePath(`/projecten/${projectId}/afrekening`);
  if (inspectionId) revalidatePath(`/schouwen/${inspectionId}/afrekening`);
}

export async function saveBillingItem(projectId: string, id: string | null, input: BillingItemInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const data = billingItemSchema.parse(input);
    const s = scoped(ctx);
    await s.getById(projects, projectId);
    const [dup] = await db.select({ id: billingItems.id }).from(billingItems).where(orgWhere(billingItems, ctx, eq(billingItems.projectId, projectId), eq(billingItems.code, data.code)));
    if (dup && dup.id !== id) throw new UserError(`Post ${data.code} bestaat al.`);
    if (id) {
      const before = await s.getById(billingItems, id);
      const after = await s.update(billingItems, id, data);
      await audit(ctx, "update", "billing_item", id, `Afrekenpost ${data.code} gewijzigd`, diffFields(before, after));
    } else {
      const [row] = await s.insert(billingItems, { ...data, projectId, sort: 999 });
      await audit(ctx, "create", "billing_item", row!.id, `Afrekenpost ${data.code} toegevoegd`);
    }
    revalidateBilling(projectId);
    return null;
  }, "Afrekenpost opgeslagen");
}

export async function deleteBillingItem(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const item = await scoped(ctx).getById(billingItems, id);
    await scoped(ctx).remove(billingItems, id);
    await audit(ctx, "delete", "billing_item", id, `Afrekenpost ${item.code} verwijderd`);
    revalidateBilling(item.projectId);
    return null;
  }, "Afrekenpost verwijderd");
}

/** Import billing items from Excel (.xlsx) or CSV. Existing codes are updated. */
export async function importBillingItems(projectId: string, formData: FormData) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    await scoped(ctx).getById(projects, projectId);
    const file = formData.get("file");
    if (!(file instanceof File)) throw new UserError("Geen bestand ontvangen.");
    let rows: unknown[][];
    if (/\.xlsx$/i.test(file.name)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new UserError("Het Excelbestand bevat geen werkblad.");
      rows = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v && typeof v === "object" && "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("") : v));
        rows.push(values);
      });
    } else {
      rows = parseCsv(await file.text());
    }
    const { items, errors } = parseBillingRows(rows);
    if (items.length === 0) throw new UserError(errors[0]?.message ?? "Geen geldige regels gevonden.");
    let created = 0;
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const [i, item] of items.entries()) {
        const [existing] = await tx.select().from(billingItems).where(and(eq(billingItems.orgId, ctx.orgId), eq(billingItems.projectId, projectId), eq(billingItems.code, item.code)));
        if (existing) {
          await tx.update(billingItems).set({ ...item, sort: i }).where(eq(billingItems.id, existing.id));
          updated++;
        } else {
          await tx.insert(billingItems).values({ ...item, sort: i, projectId, orgId: ctx.orgId, createdBy: ctx.userId });
          created++;
        }
      }
    });
    await audit(ctx, "import", "billing_item", projectId, `Afrekenposten geïmporteerd uit ${file.name}: ${created} nieuw, ${updated} bijgewerkt, ${errors.length} fout(en)`);
    revalidateBilling(projectId);
    return { created, updated, errors };
  });
}

const evidenceSchema = z.object({
  billingItemId: z.string().uuid(),
  quantity: z.number().finite().min(0),
  captureIds: z.array(z.string().uuid()).max(50),
  remark: z.string().max(2000).nullable(),
});

export async function addEvidence(inspectionId: string, input: z.input<typeof evidenceSchema>) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = evidenceSchema.parse(input);
    const s = scoped(ctx);
    const insp = await s.getById(inspections, inspectionId);
    const item = await s.getById(billingItems, data.billingItemId);
    if (item.projectId !== insp.projectId) throw new UserError("Deze post hoort niet bij het project van de schouw.");
    if (data.captureIds.length) await s.assertOwned(captures, data.captureIds);
    const [row] = await s.insert(billingEvidence, { ...data, inspectionId, source: "handmatig", status: "voorgesteld" });
    await audit(ctx, "create", "billing_evidence", row!.id, `Bewijs voor post ${item.code}: ${data.quantity} ${item.unit}`);
    revalidateBilling(item.projectId, inspectionId);
    return null;
  }, "Bewijsregel toegevoegd");
}

export async function setEvidence(evidenceId: string, patch: { status?: string; quantity?: number; remark?: string | null }) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const data = z.object({ status: z.enum(BILLING_EVIDENCE_STATUSES).optional(), quantity: z.number().finite().min(0).optional(), remark: z.string().max(2000).nullable().optional() }).parse(patch);
    if (data.status && data.status !== "voorgesteld" && !roleAtLeast(ctx.role, "projectleider")) throw new ForbiddenError("Alleen een projectleider kan afrekenbewijs bevestigen of afwijzen.");
    const before = await scoped(ctx).getById(billingEvidence, evidenceId);
    if (before.status === "bevestigd" && data.quantity !== undefined && !roleAtLeast(ctx.role, "projectleider")) throw new ForbiddenError();
    const after = await scoped(ctx).update(billingEvidence, evidenceId, {
      ...data,
      ...(data.status === "bevestigd" ? { confirmedBy: ctx.userId, confirmedAt: new Date() } : data.status ? { confirmedBy: null, confirmedAt: null } : {}),
    });
    const [item] = await db.select().from(billingItems).where(eq(billingItems.id, after.billingItemId));
    await audit(ctx, data.status ? `evidence_${data.status}` : "update", "billing_evidence", evidenceId, `Afrekenbewijs post ${item?.code}: ${data.status ?? "gewijzigd"}`, diffFields(before, after));
    revalidateBilling(item!.projectId, after.inspectionId);
    return null;
  }, "Afrekenbewijs bijgewerkt");
}

export async function deleteEvidence(evidenceId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const ev = await scoped(ctx).getById(billingEvidence, evidenceId);
    if (ev.status === "bevestigd" && !roleAtLeast(ctx.role, "projectleider")) throw new ForbiddenError();
    const [item] = await db.select().from(billingItems).where(eq(billingItems.id, ev.billingItemId));
    await scoped(ctx).remove(billingEvidence, evidenceId);
    await audit(ctx, "delete", "billing_evidence", evidenceId, `Afrekenbewijs post ${item?.code} verwijderd`);
    revalidateBilling(item!.projectId, ev.inspectionId);
    return null;
  }, "Bewijsregel verwijderd");
}

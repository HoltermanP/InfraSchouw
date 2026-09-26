"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inspectionTemplates, templateChecklistItems, templateSections, templateShots } from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { getTemplateFull } from "@/db/queries/templates";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { templateInputSchema, type TemplateInput } from "@/lib/validation/template";

type ChildTable = typeof templateChecklistItems | typeof templateShots | typeof templateSections;

async function syncChildren<T extends { id?: string }>(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: ChildTable,
  orgId: string,
  templateId: string,
  userId: string | null,
  rows: T[],
) {
  const keepIds = rows.map((r) => r.id).filter((v): v is string => Boolean(v));
  const scope = and(eq(table.orgId, orgId), eq(table.templateId, templateId));
  await tx.delete(table).where(keepIds.length ? and(scope, notInArray(table.id, keepIds)) : scope);
  for (const [sort, row] of rows.entries()) {
    const { id, ...values } = row;
    if (id) {
      await tx
        .update(table)
        .set({ ...values, sort } as never)
        .where(and(scope, eq(table.id, id)));
    } else {
      await tx.insert(table).values({ ...values, sort, orgId, templateId, createdBy: userId } as never);
    }
  }
}

export async function saveTemplate(id: string, input: TemplateInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const data = templateInputSchema.parse(input);
    const keys = data.sections.map((s) => s.key);
    if (new Set(keys).size !== keys.length) throw new UserError("Sectiesleutels moeten uniek zijn.");
    await scoped(ctx).getById(inspectionTemplates, id);
    await db.transaction(async (tx) => {
      const { checklist, shots, sections, ...meta } = data;
      await tx.update(inspectionTemplates).set(meta).where(orgWhere(inspectionTemplates, ctx, eq(inspectionTemplates.id, id)));
      await syncChildren(tx, templateChecklistItems, ctx.orgId, id, ctx.userId, checklist);
      await syncChildren(tx, templateShots, ctx.orgId, id, ctx.userId, shots);
      await syncChildren(tx, templateSections, ctx.orgId, id, ctx.userId, sections);
    });
    await audit(ctx, "update", "template", id, `Template "${data.name}" opgeslagen`);
    revalidatePath("/instellingen/templates", "layout");
    return null;
  }, "Template opgeslagen");
}

export async function duplicateTemplate(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const tpl = await getTemplateFull(ctx, id);
    if (!tpl) throw new UserError("Template niet gevonden.");
    const newId = await db.transaction(async (tx) => {
      const [copy] = await tx
        .insert(inspectionTemplates)
        .values({
          orgId: ctx.orgId,
          key: `${tpl.key}-kopie-${Date.now().toString(36)}`,
          name: `${tpl.name} (kopie)`,
          description: tpl.description,
          phase: tpl.phase,
          purposeText: tpl.purposeText,
          aiInstructions: tpl.aiInstructions,
          isStation: tpl.isStation,
          isBilling: tpl.isBilling,
          active: false,
          createdBy: ctx.userId,
        })
        .returning();
      const base = { orgId: ctx.orgId, templateId: copy!.id, createdBy: ctx.userId };
      if (tpl.checklist.length)
        await tx.insert(templateChecklistItems).values(
          tpl.checklist.map((c) => ({ ...base, sort: c.sort, question: c.question, answerType: c.answerType, options: c.options, photoRequired: c.photoRequired, required: c.required })),
        );
      if (tpl.shots.length)
        await tx.insert(templateShots).values(
          tpl.shots.map((s) => ({ ...base, sort: s.sort, groupName: s.groupName, title: s.title, description: s.description, required: s.required, stationComponent: s.stationComponent })),
        );
      if (tpl.sections.length)
        await tx.insert(templateSections).values(tpl.sections.map((s) => ({ ...base, sort: s.sort, key: s.key, title: s.title, aiHint: s.aiHint })));
      return copy!.id;
    });
    await audit(ctx, "create", "template", newId, `Kopie van template "${tpl.name}"`);
    revalidatePath("/instellingen/templates");
    return { id: newId };
  }, "Template gekopieerd");
}

export async function restoreStandardTemplates() {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const { ensureStandardTemplates } = await import("@/db/queries/templates");
    await ensureStandardTemplates(ctx.orgId, db, ctx.userId);
    revalidatePath("/instellingen/templates");
    return null;
  }, "Ontbrekende standaardtemplates toegevoegd");
}

export async function deleteTemplate(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const { inspections } = await import("@/db/schema");
    const used = await db.$count(inspections, and(eq(inspections.orgId, ctx.orgId), inArray(inspections.templateId, [id])));
    if (used > 0) throw new UserError("Dit template is in gebruik door schouwen; zet het op inactief in plaats van verwijderen.");
    await scoped(ctx).remove(inspectionTemplates, id);
    await audit(ctx, "delete", "template", id, "Template verwijderd");
    revalidatePath("/instellingen/templates");
    return null;
  }, "Template verwijderd");
}

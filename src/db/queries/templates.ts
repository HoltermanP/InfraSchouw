import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "../client";
import { inspectionTemplates, templateChecklistItems, templateSections, templateShots } from "../schema";
import { orgWhere, type OrgCtx } from "../scope";
import { STANDARD_TEMPLATES } from "@/lib/templates/standard";

/** Create any missing standard templates (section 4) for an organisation. */
export async function ensureStandardTemplates(orgId: string, conn: DbOrTx = db, createdBy: string | null = null) {
  const existing = await conn
    .select({ key: inspectionTemplates.key })
    .from(inspectionTemplates)
    .where(eq(inspectionTemplates.orgId, orgId));
  const have = new Set(existing.map((e) => e.key));
  for (const t of STANDARD_TEMPLATES) {
    if (have.has(t.key)) continue;
    const [tpl] = await conn
      .insert(inspectionTemplates)
      .values({
        orgId,
        key: t.key,
        name: t.name,
        description: t.description,
        phase: t.phase,
        purposeText: t.purposeText,
        aiInstructions: t.aiInstructions,
        isStation: t.isStation ?? false,
        isBilling: t.isBilling ?? false,
        tracksRoute: t.tracksRoute ?? false,
        createdBy,
      })
      .onConflictDoNothing()
      .returning();
    if (!tpl) continue;
    if (t.checklist.length) {
      await conn.insert(templateChecklistItems).values(
        t.checklist.map((c, i) => ({
          orgId,
          templateId: tpl.id,
          sort: i,
          question: c.question,
          answerType: c.answerType ?? "yes_no_na",
          options: c.options ?? [],
          photoRequired: c.photoRequired ?? false,
          required: c.required ?? true,
          createdBy,
        })),
      );
    }
    if (t.shots.length) {
      await conn.insert(templateShots).values(
        t.shots.map((s, i) => ({
          orgId,
          templateId: tpl.id,
          sort: i,
          groupName: s.group,
          title: s.title,
          description: s.description ?? "",
          required: s.required ?? true,
          stationComponent: s.stationComponent ?? null,
          createdBy,
        })),
      );
    }
    if (t.sections.length) {
      await conn.insert(templateSections).values(
        t.sections.map((s, i) => ({
          orgId,
          templateId: tpl.id,
          sort: i,
          key: s.key,
          title: s.title,
          aiHint: s.aiHint ?? "",
          createdBy,
        })),
      );
    }
  }
}

export type TemplateFull = typeof inspectionTemplates.$inferSelect & {
  checklist: (typeof templateChecklistItems.$inferSelect)[];
  shots: (typeof templateShots.$inferSelect)[];
  sections: (typeof templateSections.$inferSelect)[];
};

export async function listTemplates(ctx: OrgCtx, opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(inspectionTemplates)
    .where(orgWhere(inspectionTemplates, ctx, opts.activeOnly ? eq(inspectionTemplates.active, true) : undefined))
    .orderBy(asc(inspectionTemplates.name));
}

export async function getTemplatesFull(ctx: OrgCtx, ids?: string[]): Promise<TemplateFull[]> {
  const tpls = await db
    .select()
    .from(inspectionTemplates)
    .where(orgWhere(inspectionTemplates, ctx, ids ? inArray(inspectionTemplates.id, ids) : undefined))
    .orderBy(asc(inspectionTemplates.name));
  if (tpls.length === 0) return [];
  const tplIds = tpls.map((t) => t.id);
  const [checklist, shots, sections] = await Promise.all([
    db
      .select()
      .from(templateChecklistItems)
      .where(and(eq(templateChecklistItems.orgId, ctx.orgId), inArray(templateChecklistItems.templateId, tplIds)))
      .orderBy(asc(templateChecklistItems.sort)),
    db
      .select()
      .from(templateShots)
      .where(and(eq(templateShots.orgId, ctx.orgId), inArray(templateShots.templateId, tplIds)))
      .orderBy(asc(templateShots.sort)),
    db
      .select()
      .from(templateSections)
      .where(and(eq(templateSections.orgId, ctx.orgId), inArray(templateSections.templateId, tplIds)))
      .orderBy(asc(templateSections.sort)),
  ]);
  return tpls.map((t) => ({
    ...t,
    checklist: checklist.filter((c) => c.templateId === t.id),
    shots: shots.filter((s) => s.templateId === t.id),
    sections: sections.filter((s) => s.templateId === t.id),
  }));
}

export async function getTemplateFull(ctx: OrgCtx, id: string): Promise<TemplateFull | null> {
  const [tpl] = await getTemplatesFull(ctx, [id]);
  return tpl ?? null;
}

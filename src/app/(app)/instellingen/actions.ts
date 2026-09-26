"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { audit } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { ROLES } from "@/lib/domain";
import { orgSettingsSchema, resolveOrgSettings } from "@/lib/org-settings";
import { deleteObject, putObject } from "@/lib/storage";
import { purgeExpiredInspections } from "@/lib/privacy";
import { processQueuedJobs } from "@/lib/ai/sweep";

type Section = "branding" | "ai" | "export" | "privacy" | "field";

export async function updateOrgSettings(section: Section, values: unknown) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const current = resolveOrgSettings(org!.settings);
    const sectionSchema = orgSettingsSchema.shape[section];
    const parsed = sectionSchema.parse({ ...current[section], ...(values as object) });
    const next = { ...current, [section]: parsed };
    await db.update(organizations).set({ settings: next }).where(eq(organizations.id, ctx.orgId));
    await audit(ctx, "update", "organization", ctx.orgId, `Instellingen ‘${section}’ gewijzigd`, parsed as Record<string, unknown>);
    revalidatePath("/instellingen", "layout");
    return null;
  }, "Instellingen opgeslagen");
}

export async function renameOrganization(name: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const n = z.string().trim().min(2).max(200).parse(name);
    await db.update(organizations).set({ name: n }).where(eq(organizations.id, ctx.orgId));
    await audit(ctx, "update", "organization", ctx.orgId, `Organisatienaam gewijzigd in ${n}`);
    revalidatePath("/", "layout");
    return null;
  }, "Naam opgeslagen");
}

export async function uploadLogo(formData: FormData) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) throw new UserError("Geen bestand ontvangen.");
    if (file.size > 5 * 1024 * 1024) throw new UserError("Logo mag maximaal 5 MB zijn.");
    const png = await sharp(Buffer.from(await file.arrayBuffer())).resize({ width: 800, height: 300, fit: "inside", withoutEnlargement: true }).png().toBuffer().catch(() => {
      throw new UserError("Onbekend afbeeldingsformaat.");
    });
    const stored = await putObject(`orgs/${ctx.orgId}/branding/logo.png`, png, "image/png");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = resolveOrgSettings(org!.settings);
    await deleteObject(settings.branding.logoUrl).catch(() => undefined);
    await db.update(organizations).set({ settings: { ...settings, branding: { ...settings.branding, logoUrl: stored.url } } }).where(eq(organizations.id, ctx.orgId));
    await audit(ctx, "update", "organization", ctx.orgId, "Logo gewijzigd");
    revalidatePath("/instellingen/huisstijl");
    return null;
  }, "Logo opgeslagen");
}

export async function removeLogo() {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = resolveOrgSettings(org!.settings);
    await deleteObject(settings.branding.logoUrl).catch(() => undefined);
    await db.update(organizations).set({ settings: { ...settings, branding: { ...settings.branding, logoUrl: null } } }).where(eq(organizations.id, ctx.orgId));
    revalidatePath("/instellingen/huisstijl");
    return null;
  }, "Logo verwijderd");
}

export async function setMemberRole(membershipId: string, role: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const r = z.enum(ROLES).parse(role);
    const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.id, membershipId)));
    if (!m) throw new UserError("Lid niet gevonden.");
    if (m.role === "admin" && r !== "admin") {
      const admins = await db.$count(memberships, and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "admin")));
      if (admins <= 1) throw new UserError("Er moet minimaal één beheerder overblijven.");
    }
    await db.update(memberships).set({ role: r }).where(eq(memberships.id, membershipId));
    await audit(ctx, "role", "membership", membershipId, `Rol gewijzigd: ${m.role} → ${r}`, { van: m.role, naar: r });
    revalidatePath("/instellingen/gebruikers");
    return null;
  }, "Rol gewijzigd");
}

export async function runRetentionNow() {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const res = await purgeExpiredInspections(ctx.orgId);
    await audit(ctx, "retention", "organization", ctx.orgId, `Bewaartermijn toegepast: ${res.inspections} schouw(en), ${res.files} bestand(en) verwijderd`);
    revalidatePath("/instellingen/privacy");
    return res;
  }, "Bewaartermijn toegepast");
}

export async function processAiQueueNow() {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const res = await processQueuedJobs({ orgId: ctx.orgId, limit: 10 });
    revalidatePath("/instellingen/ai");
    return res;
  }, "Wachtrij verwerkt");
}

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { captureAnalyses, captures, inspections, projects, stationExpectedConfigs, stations } from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit, diffFields } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { STATION_HOUSINGS, STATION_STATUSES, STATION_TYPES } from "@/lib/domain";
import { expectedStationConfigSchema, stationDescriptionSchema } from "@/lib/station/schema";
import { applyManualEdit, getPath } from "@/lib/station/merge";
import { getStationDescription, saveStationDescription } from "@/lib/station/service";
import type { CaptureAnalysis } from "@/lib/ai/schemas";

const stationSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  owner: z.string().trim().max(200).nullable(),
  stationType: z.enum(STATION_TYPES),
  housing: z.enum(STATION_HOUSINGS),
  buildYear: z.number().int().min(1900).max(2100).nullable(),
  status: z.enum(STATION_STATUSES),
  projectId: z.string().uuid().nullable(),
  notes: z.string().max(5000).nullable(),
});
export type StationInput = z.input<typeof stationSchema>;

export async function saveStation(id: string | null, input: StationInput) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const data = stationSchema.parse(input);
    const s = scoped(ctx);
    if (data.projectId) await s.getById(projects, data.projectId);
    const [dup] = await db.select({ id: stations.id }).from(stations).where(orgWhere(stations, ctx, eq(stations.code, data.code)));
    if (dup && dup.id !== id) throw new UserError(`Stationsnummer ${data.code} bestaat al.`);
    if (id) {
      const before = await s.getById(stations, id);
      const after = await s.update(stations, id, data);
      await audit(ctx, "update", "station", id, `Station ${after.code} gewijzigd`, diffFields(before, after));
      revalidatePath(`/stations/${id}`);
      return { id };
    }
    const [row] = await s.insert(stations, data);
    await audit(ctx, "create", "station", row!.id, `Station ${data.code} aangemaakt`);
    revalidatePath("/stations");
    return { id: row!.id };
  }, "Station opgeslagen");
}

export async function deleteStation(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const st = await scoped(ctx).getById(stations, id);
    await scoped(ctx).remove(stations, id);
    await audit(ctx, "delete", "station", id, `Station ${st.code} verwijderd`);
    revalidatePath("/stations");
    return null;
  }, "Station verwijderd");
}

/** Expected (design) configuration: from the form or imported CSV/JSON. */
export async function saveExpectedConfig(stationId: string, input: unknown, source: "handmatig" | "import") {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    await scoped(ctx).getById(stations, stationId);
    const config = expectedStationConfigSchema.parse(input);
    await db
      .insert(stationExpectedConfigs)
      .values({ orgId: ctx.orgId, stationId, config, source, createdBy: ctx.userId })
      .onConflictDoUpdate({ target: stationExpectedConfigs.stationId, set: { config, source, updatedAt: new Date() }, setWhere: eq(stationExpectedConfigs.orgId, ctx.orgId) });
    await audit(ctx, source === "import" ? "import" : "update", "station_expected_config", stationId, "Verwachte configuratie opgeslagen", config as unknown as Record<string, unknown>);
    revalidatePath(`/stations/${stationId}`);
    return null;
  }, "Verwachte configuratie opgeslagen");
}

async function loadInspectionStation(inspectionId: string) {
  const ctx = await requireCtx("schouwer");
  const insp = await scoped(ctx).getById(inspections, inspectionId);
  if (!insp.stationId) throw new UserError("Deze schouw is niet aan een station gekoppeld.");
  return { ctx, insp, stationId: insp.stationId };
}

/** Manual edit of one field (or array) of the installation description. */
export async function updateStationField(inspectionId: string, path: string, value: unknown) {
  return safeAction(async () => {
    const { ctx, stationId } = await loadInspectionStation(inspectionId);
    if (!/^[a-z_]+(\.[a-z_0-9]+)*$/.test(path)) throw new UserError("Ongeldig veld.");
    const existing = await getStationDescription(ctx.orgId, inspectionId);
    const next = applyManualEdit(existing?.data ?? null, path, value, ctx.userId);
    // The result must still satisfy the schema.
    stationDescriptionSchema.parse(next.values);
    await saveStationDescription(ctx, inspectionId, stationId, next);
    await audit(ctx, "update", "station_description", inspectionId, `Installatiebeschrijving: ${path} handmatig aangepast`, { path, van: existing ? (getPath(existing.data.values, path) ?? null) : null, naar: value as never });
    revalidatePath(`/schouwen/${inspectionId}/station`);
    return null;
  });
}

/** Take over nameplate data (OCR/AI) into the description as manual (accepted) values. */
export async function applyNameplate(inspectionId: string, captureId: string, target: "mv" | "trafo") {
  return safeAction(async () => {
    const { ctx, stationId } = await loadInspectionStation(inspectionId);
    await scoped(ctx).getById(captures, captureId);
    const [analysis] = await db
      .select({ result: captureAnalyses.result })
      .from(captureAnalyses)
      .where(and(eq(captureAnalyses.orgId, ctx.orgId), eq(captureAnalyses.captureId, captureId)))
      .orderBy(captureAnalyses.version);
    const plate = (analysis?.result as CaptureAnalysis | undefined)?.nameplate;
    if (!plate) throw new UserError("Op deze foto is geen typeplaat herkend.");
    let doc = (await getStationDescription(ctx.orgId, inspectionId))?.data ?? null;
    const num = (v: string | null) => {
      const m = v?.replace(",", ".").match(/[\d.]+/);
      return m ? Number(m[0]) : null;
    };
    if (target === "mv") {
      if (plate.merk) doc = applyManualEdit(doc, "mv_switchgear.fabrikant", plate.merk, ctx.userId);
      if (plate.type) doc = applyManualEdit(doc, "mv_switchgear.type", plate.type, ctx.userId);
      if (plate.serienummer) doc = applyManualEdit(doc, "mv_switchgear.serienummer", plate.serienummer, ctx.userId);
      if (plate.bouwjaar) doc = applyManualEdit(doc, "mv_switchgear.bouwjaar", plate.bouwjaar, ctx.userId);
      if (num(plate.spanning)) doc = applyManualEdit(doc, "mv_switchgear.nominale_spanning_kv", num(plate.spanning), ctx.userId);
      const ids = new Set([...(doc!.values.mv_switchgear.capture_ids ?? []), captureId]);
      doc = applyManualEdit(doc, "mv_switchgear.capture_ids", [...ids], ctx.userId);
    } else {
      const current = doc?.values.transformers ?? [];
      const t = current[0] ?? { fabrikant: null, type: null, vermogen_kva: null, primair_kv: null, secundair_v: null, schakelgroep: null, koeling: null, bouwjaar: null, serienummer: null, capture_ids: [] };
      const updated = {
        ...t,
        fabrikant: plate.merk ?? t.fabrikant,
        type: plate.type ?? t.type,
        serienummer: plate.serienummer ?? t.serienummer,
        bouwjaar: plate.bouwjaar ?? t.bouwjaar,
        vermogen_kva: num(plate.vermogen) ?? t.vermogen_kva,
        capture_ids: [...new Set([...t.capture_ids, captureId])],
      };
      doc = applyManualEdit(doc, "transformers", [updated, ...current.slice(1)], ctx.userId);
    }
    await saveStationDescription(ctx, inspectionId, stationId, doc!);
    await audit(ctx, "nameplate", "station_description", inspectionId, `Typeplaatgegevens overgenomen (${target === "mv" ? "MS-installatie" : "transformator"})`);
    revalidatePath(`/schouwen/${inspectionId}/station`);
    return null;
  }, "Typeplaatgegevens overgenomen");
}

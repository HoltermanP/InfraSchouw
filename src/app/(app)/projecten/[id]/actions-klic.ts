"use server";

import { revalidatePath } from "next/cache";
import { klicImports, projects } from "@/db/schema";
import { scoped } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { parseKlicDelivery } from "@/lib/geo/klic";
import { putObject } from "@/lib/storage";

export async function importKlic(projectId: string, formData: FormData) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    await scoped(ctx).getById(projects, projectId);
    const file = formData.get("file");
    if (!(file instanceof File)) throw new UserError("Geen bestand ontvangen.");
    if (file.size > 200 * 1024 * 1024) throw new UserError("Bestand is te groot (max. 200 MB).");
    const buf = new Uint8Array(await file.arrayBuffer());
    const { collection, meldingnummer } = await parseKlicDelivery(buf, file.name);
    if (collection.features.length === 0) throw new UserError("Geen kabels of leidingen gevonden in deze levering (verwacht IMKL-GML of een KLIC-ZIP).");
    const stored = await putObject(`orgs/${ctx.orgId}/projects/${projectId}/klic-${Date.now()}.${file.name.toLowerCase().endsWith(".zip") ? "zip" : "xml"}`, Buffer.from(buf), file.type || "application/octet-stream");
    const [row] = await scoped(ctx).insert(klicImports, {
      projectId,
      name: file.name,
      meldingnummer,
      fileUrl: stored.url,
      featureCount: collection.features.length,
      geojson: collection,
    });
    await audit(ctx, "import", "project", projectId, `KLIC-levering ${meldingnummer ?? file.name} geïmporteerd (${collection.features.length} objecten)`);
    revalidatePath(`/projecten/${projectId}`, "layout");
    return { id: row!.id, count: collection.features.length };
  }, "KLIC-levering geïmporteerd");
}

export async function setKlicVisible(id: string, visible: boolean) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const row = await scoped(ctx).update(klicImports, id, { visible });
    revalidatePath(`/projecten/${row.projectId}`, "layout");
    return null;
  });
}

export async function deleteKlic(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("projectleider");
    const row = await scoped(ctx).getById(klicImports, id);
    await scoped(ctx).remove(klicImports, id);
    revalidatePath(`/projecten/${row.projectId}`, "layout");
    return null;
  }, "KLIC-laag verwijderd");
}

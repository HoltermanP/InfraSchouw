"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { captures, inspections } from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction } from "@/lib/action-result";
import { relocateFromTrack } from "@/lib/capture-sources/persist";
import { deleteObject } from "@/lib/storage";

/** Assign inbox captures to an inspection (numbered, located on its GPS track). */
export async function assignCaptures(ids: string[], inspectionId: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    z.array(z.string().uuid()).min(1).max(500).parse(ids);
    await scoped(ctx).getById(inspections, inspectionId);
    const rows = await db
      .select()
      .from(captures)
      .where(orgWhere(captures, ctx, inArray(captures.id, ids), isNull(captures.inspectionId)))
      .orderBy(captures.capturedAt);
    const [m] = await db.select({ m: max(captures.seq) }).from(captures).where(and(eq(captures.orgId, ctx.orgId), eq(captures.inspectionId, inspectionId)));
    let seq = m?.m ?? 0;
    for (const c of rows) {
      const numbered = ["photo", "video", "sketch"].includes(c.type);
      await db.update(captures).set({ inspectionId, seq: numbered ? ++seq : null }).where(eq(captures.id, c.id));
    }
    await relocateFromTrack(ctx, inspectionId);
    await audit(ctx, "assign", "capture", inspectionId, `${rows.length} capture(s) uit inbox toegewezen aan schouw`);
    revalidatePath("/inbox");
    revalidatePath(`/schouwen/${inspectionId}`, "layout");
    return { count: rows.length };
  }, "Toegewezen aan schouw");
}

export async function deleteInboxCaptures(ids: string[]) {
  return safeAction(async () => {
    const ctx = await requireCtx("schouwer");
    const rows = await db.select().from(captures).where(orgWhere(captures, ctx, inArray(captures.id, ids), isNull(captures.inspectionId)));
    await db.delete(captures).where(orgWhere(captures, ctx, inArray(captures.id, rows.map((r) => r.id))));
    await Promise.all(rows.flatMap((r) => [deleteObject(r.blobUrl), deleteObject(r.thumbUrl)]));
    revalidatePath("/inbox");
    return null;
  }, "Verwijderd");
}

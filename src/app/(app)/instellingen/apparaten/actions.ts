"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { devices, memberships } from "@/db/schema";
import { orgWhere, scoped } from "@/db/scope";
import { audit } from "@/db/queries/audit";
import { requireCtx } from "@/lib/auth/session";
import { safeAction, UserError } from "@/lib/action-result";
import { DEVICE_KINDS } from "@/lib/domain";
import { newDeviceToken } from "@/lib/devices";
import { hashToken } from "@/lib/share";

export async function createDevice(input: { name: string; kind: string; userId: string }) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    const data = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(DEVICE_KINDS), userId: z.string().uuid() }).parse(input);
    const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, data.userId)));
    if (!m) throw new UserError("Gebruiker hoort niet bij deze organisatie.");
    const { token, prefix } = newDeviceToken();
    const [row] = await scoped(ctx).insert(devices, { ...data, tokenHash: hashToken(token), tokenPrefix: prefix });
    await audit(ctx, "create", "device", row!.id, `Apparaat "${data.name}" gekoppeld`);
    revalidatePath("/instellingen/apparaten");
    // Only moment the plain token is available.
    return { id: row!.id, token };
  }, "Apparaat aangemaakt");
}

export async function revokeDevice(id: string) {
  return safeAction(async () => {
    const ctx = await requireCtx("admin");
    await db.update(devices).set({ revokedAt: new Date() }).where(orgWhere(devices, ctx, eq(devices.id, id)));
    await audit(ctx, "revoke", "device", id, "Apparaattoken ingetrokken");
    revalidatePath("/instellingen/apparaten");
    return null;
  }, "Token ingetrokken");
}

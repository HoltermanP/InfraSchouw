import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { devices, memberships } from "@/db/schema";
import { hashToken } from "@/lib/share";
import type { OrgCtx } from "@/db/scope";

/** Device tokens look like `isg_<8-char prefix>_<secret>`; only the SHA-256 hash is stored. */
export function newDeviceToken() {
  const prefix = randomBytes(6).toString("base64url").slice(0, 8);
  const secret = randomBytes(32).toString("base64url");
  return { token: `isg_${prefix}_${secret}`, prefix };
}

export async function authenticateDevice(authHeader: string | null) {
  const token = authHeader?.match(/^Bearer\s+(isg_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return null;
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, hashToken(token)), isNull(devices.revokedAt)))
    .limit(1);
  if (!device) return null;
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, device.orgId), eq(memberships.userId, device.userId)))
    .limit(1);
  if (!membership || membership.role === "lezer") return null;
  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
  const ctx: OrgCtx = { orgId: device.orgId, userId: device.userId, role: membership.role };
  return { device, ctx };
}

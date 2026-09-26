import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { reports, shareLinks } from "@/db/schema";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Resolve a public share token to a (non-revoked, non-expired) link on a final report. */
export async function resolveShareToken(token: string | null | undefined, opts: { touch?: boolean } = {}) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const [row] = await db
    .select({ link: shareLinks, report: reports })
    .from(shareLinks)
    .innerJoin(reports, eq(reports.id, shareLinks.reportId))
    .where(and(eq(shareLinks.tokenHash, hashToken(token)), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (row.report.status !== "definitief" && row.report.status !== "herzien") return null;
  if (opts.touch) {
    await db
      .update(shareLinks)
      .set({ lastAccessedAt: new Date(), accessCount: sql`${shareLinks.accessCount} + 1` })
      .where(eq(shareLinks.id, row.link.id));
  }
  return row;
}

import { db, type DbOrTx } from "../client";
import { auditLog } from "../schema";
import type { OrgCtx } from "../scope";

export type AuditEntity =
  | "project"
  | "inspection"
  | "report"
  | "report_version"
  | "billing_item"
  | "billing_evidence"
  | "station"
  | "station_description"
  | "station_expected_config"
  | "finding"
  | "action"
  | "template"
  | "membership"
  | "device"
  | "share_link"
  | "capture"
  | "organization";

/** Append-only audit trail (who did what, when, on which object). */
export async function audit(
  ctx: OrgCtx,
  action: string,
  entityType: AuditEntity,
  entityId: string,
  summary?: string,
  diff?: Record<string, unknown> | null,
  conn: DbOrTx = db,
) {
  await conn.insert(auditLog).values({
    orgId: ctx.orgId,
    userId: ctx.userId,
    createdBy: ctx.userId,
    action,
    entityType,
    entityId,
    summary: summary ?? null,
    diff: diff ?? null,
  });
}

/** Shallow diff of changed fields for the audit log. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { van: unknown; naar: unknown }> {
  const out: Record<string, { van: unknown; naar: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { van: a ?? null, naar: b ?? null };
  }
  return out;
}

import { NextResponse } from "next/server";
import { withSession, jsonError } from "@/lib/api";
import { applySyncOps } from "@/lib/sync/apply";
import { syncRequestSchema, type SyncResponse } from "@/lib/sync/ops";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

/** Replay offline outbox operations (idempotent). */
export const POST = withSession(async (req, session) => {
  if (session.role === "lezer") return jsonError(403, "Lezers kunnen geen schouwgegevens vastleggen.");
  await checkRateLimit("upload", session.org.id);
  const raw = (await req.json().catch(() => null)) as { ops?: { id?: string }[] } | null;
  const body = syncRequestSchema.safeParse(raw);
  if (!body.success) {
    // Validate per op so that one bad op does not block the others.
    if (!raw?.ops?.length) return jsonError(400, "Ongeldige sync-aanvraag.");
    const { syncOpSchema } = await import("@/lib/sync/ops");
    const results = [];
    const valid = [];
    for (const op of raw.ops) {
      const parsed = syncOpSchema.safeParse(op);
      if (parsed.success) valid.push(parsed.data);
      else results.push({ id: String(op.id ?? ""), ok: false as const, error: parsed.error.issues[0]?.message ?? "Ongeldig", permanent: true });
    }
    results.push(...(await applySyncOps(session.ctx, valid)));
    const order = new Map(raw.ops.map((o, i) => [String(o.id), i]));
    results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return NextResponse.json({ results, serverTime: new Date().toISOString() } satisfies SyncResponse);
  }
  const results = await applySyncOps(session.ctx, body.data.ops);
  return NextResponse.json({ results, serverTime: new Date().toISOString() } satisfies SyncResponse);
});

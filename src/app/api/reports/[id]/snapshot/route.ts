import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { withSession, jsonError } from "@/lib/api";
import { audit } from "@/db/queries/audit";
import { deleteObject, putObject } from "@/lib/storage";

/** Store a MapLibre snapshot (PNG) as the report's overview map. */
export const POST = withSession<RouteContext<"/api/reports/[id]/snapshot">>(async (req, session, ctx) => {
  const { id } = await ctx.params;
  const [report] = await db.select().from(reports).where(and(eq(reports.orgId, session.org.id), eq(reports.id, id))).limit(1);
  if (!report) return jsonError(404, "Niet gevonden.");
  if (report.status === "definitief") return jsonError(409, "Verslag is definitief.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size > 15 * 1024 * 1024) return jsonError(400, "Ongeldig bestand.");
  const stored = await putObject(`orgs/${session.org.id}/reports/${id}/kaart.png`, Buffer.from(await file.arrayBuffer()), "image/png");
  await deleteObject(report.mapSnapshotUrl).catch(() => undefined);
  await db.update(reports).set({ mapSnapshotUrl: stored.url }).where(eq(reports.id, id));
  await audit(session.ctx, "map_snapshot", "report", id, "Kaartbeeld voor verslag vastgelegd");
  return NextResponse.json({ ok: true });
}, "schouwer");

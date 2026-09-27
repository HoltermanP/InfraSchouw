import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { captures, transcriptSegments, transcripts } from "@/db/schema";
import { linkItemsToWindows } from "@/lib/geo/track-matching";

/**
 * (Re)link transcript segments to captures in the same time window. Voice
 * notes attached to a photo are always linked to that photo.
 */
export async function linkSegmentsToCaptures(orgId: string, inspectionId: string, paddingMs = 15_000) {
  const segs = await db
    .select({ id: transcriptSegments.id, startAt: transcriptSegments.startAt, endAt: transcriptSegments.endAt, captureId: transcripts.captureId })
    .from(transcriptSegments)
    .innerJoin(transcripts, eq(transcripts.id, transcriptSegments.transcriptId))
    .where(and(eq(transcriptSegments.orgId, orgId), eq(transcriptSegments.inspectionId, inspectionId)));
  if (segs.length === 0) return;
  const items = await db
    .select({ id: captures.id, capturedAt: captures.capturedAt, type: captures.type, parentCaptureId: captures.parentCaptureId })
    .from(captures)
    .where(and(eq(captures.orgId, orgId), eq(captures.inspectionId, inspectionId), inArray(captures.type, ["photo", "video", "sketch", "measurement", "scan"])));
  const audioParents = new Map(
    (
      await db
        .select({ id: captures.id, parent: captures.parentCaptureId })
        .from(captures)
        .where(and(eq(captures.orgId, orgId), eq(captures.inspectionId, inspectionId), eq(captures.type, "audio")))
    ).map((r) => [r.id, r.parent]),
  );
  const linked = linkItemsToWindows(
    segs.map((s) => ({ start: s.startAt.getTime(), end: s.endAt.getTime() })),
    items.map((i) => ({ id: i.id, t: i.capturedAt.getTime() })),
    paddingMs,
  );
  for (const [i, seg] of segs.entries()) {
    const ids = new Set(linked[i]);
    const parent = audioParents.get(seg.captureId);
    if (parent) ids.add(parent);
    ids.delete(seg.captureId);
    await db.update(transcriptSegments).set({ captureIds: [...ids] }).where(eq(transcriptSegments.id, seg.id));
  }
}

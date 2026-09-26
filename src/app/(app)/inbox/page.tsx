import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { InboxList } from "@/components/inspections/inbox-list";
import { BackendImport } from "@/components/inspections/backend-import";
import { db } from "@/db/client";
import { captures, devices, inspections } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { captureUrl } from "@/lib/media-url";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const session = await requireSession("schouwer");
  const [rows, recent] = await Promise.all([
    db
      .select({ c: captures, deviceName: devices.name })
      .from(captures)
      .leftJoin(devices, eq(devices.id, captures.deviceId))
      .where(and(eq(captures.orgId, session.org.id), isNull(captures.inspectionId)))
      .orderBy(desc(captures.capturedAt)),
    db
      .select({ id: inspections.id, title: inspections.title })
      .from(inspections)
      .where(and(eq(inspections.orgId, session.org.id), ne(inspections.status, "gearchiveerd")))
      .orderBy(desc(inspections.startedAt))
      .limit(50),
  ]);
  return (
    <>
      <PageHeader
        title="Inbox — niet-toegewezen captures"
        description="Captures van smart glasses of imports die (nog) niet bij een schouw horen."
        actions={<BackendImport inspectionId={null} label="Importeren naar inbox" />}
      />
      <PageBody>
        <InboxList
          canEdit={roleAtLeast(session.role, "schouwer")}
          inspections={recent}
          rows={rows.map(({ c, deviceName }) => ({
            id: c.id,
            type: c.type,
            source: c.source,
            capturedAt: c.capturedAt.toISOString(),
            thumb: c.thumbUrl || c.blobUrl ? captureUrl(c.id, "thumb") : null,
            locationSource: c.locationSource,
            deviceName,
            note: c.note,
          }))}
        />
      </PageBody>
    </>
  );
}

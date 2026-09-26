import { desc, eq } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { DevicesPanel } from "@/components/settings/devices-panel";
import { db } from "@/db/client";
import { devices, users } from "@/db/schema";
import { listOrgMembers } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Apparaten" };

export default async function DevicesPage() {
  const session = await requireSession("admin");
  const [rows, members] = await Promise.all([
    db.select({ d: devices, userName: users.name }).from(devices).innerJoin(users, eq(users.id, devices.userId)).where(eq(devices.orgId, session.org.id)).orderBy(desc(devices.createdAt)),
    listOrgMembers(session.ctx),
  ]);
  return (
    <PageBody>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Smart glasses die via een companion-app op de telefoon koppelen (bijv. Meta Ray-Ban) sturen foto&apos;s, video en audio naar de ingest-API met een apparaattoken. Captures landen automatisch in de lopende schouw van de gekoppelde gebruiker, of anders in de inbox. Brillen met een eigen browser (RealWear, Vuzix) gebruiken gewoon de bril-modus van de veld-app.
      </p>
      <DevicesPanel
        users={members.filter((m) => m.role !== "lezer").map((m) => ({ id: m.user.id, name: m.user.name }))}
        devices={rows.map(({ d, userName }) => ({
          id: d.id,
          name: d.name,
          kind: d.kind,
          userName,
          tokenPrefix: d.tokenPrefix,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          revokedAt: d.revokedAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </PageBody>
  );
}

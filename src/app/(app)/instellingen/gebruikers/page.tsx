import { OrganizationProfile } from "@clerk/nextjs";
import { PageBody } from "@/components/layout/page-header";
import { MembersTable } from "@/components/settings/settings-forms";
import { listOrgMembers } from "@/db/queries/projects";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Gebruikers & rollen" };

export default async function UsersPage() {
  const session = await requireSession("admin");
  const members = await listOrgMembers(session.ctx);
  return (
    <PageBody>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Rollen: <strong>Beheerder</strong> (alles, instellingen, templates, gebruikers) · <strong>Projectleider</strong> (projecten, verslagen goedkeuren, afrekening bevestigen) ·{" "}
        <strong>Schouwer</strong> (schouwen uitvoeren, conceptverslag bewerken) · <strong>Lezer</strong> (alleen lezen).
      </p>
      <MembersTable currentUserId={session.user.id} members={members.map((m) => ({ membershipId: m.membershipId, userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role }))} />
      {session.mode === "clerk" ? (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Leden uitnodigen en beheren</h2>
          <OrganizationProfile routing="hash" />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">In de demo-omgeving worden gebruikers via de seed aangemaakt. Met Clerk nodig je hier leden uit.</p>
      )}
    </PageBody>
  );
}

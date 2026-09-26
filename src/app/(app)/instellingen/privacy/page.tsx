import { PageBody } from "@/components/layout/page-header";
import { PrivacyForm } from "@/components/settings/settings-forms";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Privacy (AVG)" };

export default async function PrivacyPage() {
  const session = await requireSession("admin");
  return (
    <PageBody>
      <PrivacyForm settings={session.org.settings.privacy} />
      <section className="max-w-3xl text-sm text-muted-foreground">
        <h2 className="mb-1 font-semibold text-foreground">AVG-functies in InfraSchouw</h2>
        <ul className="list-disc pl-5">
          <li>De beeldanalyse signaleert herkenbare personen en leesbare kentekens (zichtbaar bij de foto).</li>
          <li>In de annotatie-editor vervaag je een rechthoek (AVG-vervaging); het verslag gebruikt de vervaagde versie, het origineel blijft alleen voor bevoegden beschikbaar.</li>
          <li>Een verwijderverzoek per schouw verwijdert de schouw inclusief alle media, transcripties, handtekeningen, verslagen en exports (knop op de schouwpagina, alleen beheerders).</li>
          <li>Alle wijzigingen aan verslagen, afrekening en stationsdata staan in de audit-log.</li>
        </ul>
      </section>
    </PageBody>
  );
}

import { PageBody, PageHeader } from "@/components/layout/page-header";
import { GlassesSimulator } from "@/components/settings/glasses-simulator";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Bril-simulator" };

export default async function GlassesSimulatorPage() {
  const session = await requireSession("admin");
  return (
    <>
      <PageHeader
        title="Smart-glasses simulator"
        description="Roept de echte ingest-API aan met testmedia, zodat de keten bril → companion-app → InfraSchouw aantoonbaar werkt."
      />
      <PageBody>
        <GlassesSimulator userId={session.user.id} />
      </PageBody>
    </>
  );
}

import { PageBody } from "@/components/layout/page-header";
import { ExportSettingsForm } from "@/components/settings/settings-forms";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Exportinstellingen" };

export default async function ExportSettingsPage() {
  const session = await requireSession("admin");
  return (
    <PageBody>
      <ExportSettingsForm settings={session.org.settings.export} />
    </PageBody>
  );
}

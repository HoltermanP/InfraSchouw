import { PageBody } from "@/components/layout/page-header";
import { OrganizationForm } from "@/components/settings/settings-forms";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Organisatie" };

export default async function OrganizationSettingsPage() {
  const session = await requireSession("admin");
  return (
    <PageBody>
      <OrganizationForm name={session.org.name} settings={session.org.settings} clerkManaged={session.mode === "clerk"} />
    </PageBody>
  );
}

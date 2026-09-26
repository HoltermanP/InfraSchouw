import { PageBody } from "@/components/layout/page-header";
import { BrandingForm } from "@/components/settings/settings-forms";
import { requireSession } from "@/lib/auth/session";
import { fileUrl } from "@/lib/media-url";

export const metadata = { title: "Verslaghuisstijl" };

export default async function BrandingPage() {
  const session = await requireSession("admin");
  const b = session.org.settings.branding;
  return (
    <PageBody>
      <BrandingForm settings={b} logoSrc={fileUrl(b.logoUrl)} />
    </PageBody>
  );
}

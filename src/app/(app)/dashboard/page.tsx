import { PageBody, PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader title={`Welkom, ${session.user.name}`} description={session.org.name} />
      <PageBody>
        <p className="text-muted-foreground">Het dashboard wordt gevuld met recente schouwen, verslagen en actiepunten.</p>
      </PageBody>
    </>
  );
}

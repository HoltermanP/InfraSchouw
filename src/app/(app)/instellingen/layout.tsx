import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";
import { requireSession } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireSession("admin");
  return (
    <>
      <PageHeader title="Instellingen" description="Organisatie, gebruikers, templates, huisstijl, apparaten en AI." />
      <TabNav
        items={[
          { href: "/instellingen", label: "Organisatie" },
          { href: "/instellingen/gebruikers", label: "Gebruikers & rollen" },
          { href: "/instellingen/templates", label: "Schouwtemplates" },
          { href: "/instellingen/huisstijl", label: "Verslaghuisstijl" },
          { href: "/instellingen/apparaten", label: "Apparaten" },
          { href: "/instellingen/ai", label: "AI" },
          { href: "/instellingen/export", label: "Export" },
          { href: "/instellingen/privacy", label: "Privacy (AVG)" },
          { href: "/instellingen/audit", label: "Audit-log" },
        ]}
      />
      {children}
    </>
  );
}

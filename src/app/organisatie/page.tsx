import { redirect } from "next/navigation";
import { OrganizationList } from "@clerk/nextjs";
import { getSession, signInPath } from "@/lib/auth/session";

export const metadata = { title: "Organisatie kiezen" };

export default async function OrganizationPage() {
  const session = await getSession();
  if (session.status === "signed-out") redirect(signInPath());
  if (session.status === "ok") redirect("/dashboard");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Kies of maak een organisatie</h1>
        <p className="mt-2 text-muted-foreground">
          InfraSchouw werkt per organisatie. Alle projecten, schouwen en verslagen zijn alleen zichtbaar voor leden van
          dezelfde organisatie.
        </p>
      </div>
      {session.mode === "clerk" ? (
        <OrganizationList hidePersonal afterSelectOrganizationUrl="/dashboard" afterCreateOrganizationUrl="/dashboard" />
      ) : (
        <p className="text-muted-foreground">Dit demo-account is aan geen organisatie gekoppeld.</p>
      )}
    </main>
  );
}

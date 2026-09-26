import { authMode } from "@/lib/auth/session";

export const metadata = { title: "Configuratie vereist" };

export default function ConfigPage() {
  const mode = authMode();
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-6 py-12">
      <h1 className="text-2xl font-bold">Configuratie vereist</h1>
      {mode === "unconfigured" ? (
        <>
          <p>
            Er is geen authenticatie geconfigureerd. Stel <code>CLERK_SECRET_KEY</code> en{" "}
            <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in voor productie, of zet <code>DEMO_MODE=true</code> om de
            demo-omgeving met demogebruikers te gebruiken.
          </p>
          <p className="text-sm text-muted-foreground">Zie README.md en .env.example voor alle variabelen.</p>
        </>
      ) : (
        <p>Authenticatie is geconfigureerd ({mode}). Je kunt inloggen.</p>
      )}
    </main>
  );
}

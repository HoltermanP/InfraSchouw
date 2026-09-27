import { authMode } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata = { title: "Configuratie" };
export const dynamic = "force-dynamic";

export default function ConfigPage() {
  const mode = authMode();
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-6 py-12">
      <h1 className="text-2xl font-bold">Configuratie</h1>
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
      <h2 className="mt-4 text-lg font-semibold">Integraties</h2>
      <ul className="divide-y rounded-lg border text-sm">
        {integrations().map((i) => (
          <li key={i.name} className="flex items-start justify-between gap-4 p-3">
            <div>
              <p className="font-medium">{i.name}</p>
              <p className="text-muted-foreground">{i.on ? i.onText : i.offText}</p>
            </div>
            <span className={i.on ? "font-semibold text-emerald-700" : i.required ? "font-semibold text-red-700" : "text-muted-foreground"}>
              {i.on ? "actief" : i.required ? "ontbreekt" : "uit"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** Status per integration; shows only whether it is configured, never the values. */
function integrations() {
  const onVercel = Boolean(process.env.VERCEL);
  return [
    { name: "Bestandsopslag (Vercel Blob)", on: env.blob.enabled, required: onVercel, onText: "Foto's, video's en exports worden opgeslagen in Vercel Blob.", offText: onVercel ? "BLOB_READ_WRITE_TOKEN ontbreekt: uploads uit de veld-app mislukken en blijven wachten." : "Lokale opslag in .data/uploads (alleen voor lokaal gebruik)." },
    { name: "AI (OpenAI)", on: env.openai.enabled, required: false, onText: "Foto-analyse, transcriptie en verslagvoorstellen actief.", offText: "OPENAI_API_KEY ontbreekt: AI-stappen worden overgeslagen." },
    { name: "Achtergrondjobs (QStash)", on: env.qstash.enabled, required: false, onText: "AI-jobs lopen via QStash.", offText: "AI-jobs draaien direct na het verzoek." },
    { name: "Rate limiting (Upstash Redis)", on: env.redis.enabled, required: false, onText: "Gedeelde rate limiting actief.", offText: "Rate limiting per serverinstantie." },
    { name: "Clerk-webhook", on: Boolean(env.clerk.webhookSecret), required: false, onText: "Gebruikers en organisaties worden gesynchroniseerd.", offText: "CLERK_WEBHOOK_SECRET ontbreekt (gebruikers worden bij inloggen aangemaakt)." },
  ];
}

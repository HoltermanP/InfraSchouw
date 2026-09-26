import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Je bent offline</h1>
      <p className="max-w-md text-muted-foreground">
        Deze pagina is niet beschikbaar zonder verbinding. De veld-app werkt wel volledig offline; alles wat je vastlegt
        wordt gesynchroniseerd zodra er weer verbinding is.
      </p>
      <Link href="/veld" className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">
        Open de veld-app
      </Link>
    </main>
  );
}

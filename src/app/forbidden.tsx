import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Geen toegang</h1>
      <p className="max-w-md text-muted-foreground">Je rol heeft geen rechten voor deze pagina. Vraag een beheerder om je rol aan te passen.</p>
      <Link href="/dashboard" className="text-primary underline">
        Naar het dashboard
      </Link>
    </main>
  );
}

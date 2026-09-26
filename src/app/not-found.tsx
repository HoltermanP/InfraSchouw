import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Niet gevonden</h1>
      <p className="text-muted-foreground">Deze pagina of dit item bestaat niet (meer) of hoort bij een andere organisatie.</p>
      <Link href="/dashboard" className="text-primary underline">
        Naar het dashboard
      </Link>
    </main>
  );
}

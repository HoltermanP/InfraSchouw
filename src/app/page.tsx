import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, FileText, Map, ShieldCheck, Zap, Glasses } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSession, signInPath } from "@/lib/auth/session";

export default async function LandingPage() {
  const session = await getSession();
  if (session.status === "ok") redirect("/dashboard");
  const features = [
    { icon: Camera, title: "Vastleggen in het veld", text: "Foto, video, spraak, metingen, schetsen en QR — ook offline en handsfree." },
    { icon: Zap, title: "AI-verslagvoorstel", text: "Na afronden maakt AI een gestructureerd voorstel met foto's op de juiste plek." },
    { icon: Map, title: "Kaart met PDOK", text: "Alle foto's, bevindingen en het gelopen tracé op de BRT-kaart of luchtfoto, met RD-coördinaten." },
    { icon: ShieldCheck, title: "MS-stations & afrekening", text: "Installatiebeschrijving, as-built-check en bewijsvoering voor de afrekenstaat." },
    { icon: FileText, title: "Professionele export", text: "PDF, Word, Excel, ZIP en GeoJSON in de huisstijl van je organisatie." },
    { icon: Glasses, title: "Smart glasses", text: "Spraakgestuurde bril-UI en een ingest-API voor camerabrillen." },
  ];
  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-20">
          <p className="text-sm font-semibold tracking-widest text-sidebar-primary uppercase">InfraSchouw</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
            Schouwen in ondergrondse infra — van veldopname tot definitief verslag.
          </h1>
          <p className="max-w-2xl text-lg opacity-85">
            Voor netbeheerders, waterbedrijven, aannemers en ingenieursbureaus: kabels &amp; leidingen, MS-netten en MS-stations.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={signInPath()} className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" })}>
              Inloggen
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border p-5">
            <f.icon className="mb-3 size-6 text-primary" aria-hidden />
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

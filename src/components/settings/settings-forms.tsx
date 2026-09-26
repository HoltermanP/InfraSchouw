"use client";

import { useState } from "react";
import { Save, Trash2, Upload, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { processAiQueueNow, removeLogo, renameOrganization, runRetentionNow, setMemberRole, updateOrgSettings, uploadLogo } from "@/app/(app)/instellingen/actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain";
import type { ResolvedOrgSettings } from "@/lib/org-settings";

export function OrganizationForm({ name, settings, clerkManaged }: { name: string; settings: ResolvedOrgSettings; clerkManaged: boolean }) {
  const { run, pending } = useAction();
  const [n, setN] = useState(name);
  const [field, setField] = useState(settings.field);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-end gap-2">
        <Field label="Naam organisatie" htmlFor="org-name" className="flex-1" hint={clerkManaged ? "De naam wordt ook in Clerk beheerd; deze wijziging geldt voor InfraSchouw." : undefined}>
          <Input id="org-name" value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Button disabled={pending} onClick={() => run(() => renameOrganization(n))}>
          <Save /> Opslaan
        </Button>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Veld-app</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GPS-trackinterval (seconden)" htmlFor="f-gps">
            <Input id="f-gps" type="number" min={1} max={120} value={field.gpsIntervalSeconds} onChange={(e) => setField({ ...field, gpsIntervalSeconds: Number(e.target.value) })} />
          </Field>
          <Field label="Maximale videoduur (seconden)" htmlFor="f-video">
            <Input id="f-video" type="number" min={10} max={1800} value={field.maxVideoSeconds} onChange={(e) => setField({ ...field, maxVideoSeconds: Number(e.target.value) })} />
          </Field>
          <Field label="Keyframe-interval video (seconden)" htmlFor="f-kf">
            <Input id="f-kf" type="number" min={1} max={60} value={field.keyframeIntervalSeconds} onChange={(e) => setField({ ...field, keyframeIntervalSeconds: Number(e.target.value) })} />
          </Field>
          <Field label="Waarschuwing GPS-nauwkeurigheid (m)" htmlFor="f-acc">
            <Input id="f-acc" type="number" min={1} max={500} value={field.accuracyWarningMeters} onChange={(e) => setField({ ...field, accuracyWarningMeters: Number(e.target.value) })} />
          </Field>
        </div>
        <Button className="w-fit" disabled={pending} onClick={() => run(() => updateOrgSettings("field", field))}>
          <Save /> Veldinstellingen opslaan
        </Button>
      </section>
    </div>
  );
}

export function MembersTable({ members, currentUserId }: { members: { membershipId: string; userId: string; name: string; email: string; role: Role }[]; currentUserId: string }) {
  const { run, pending } = useAction();
  return (
    <table className="w-full max-w-3xl text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-2">Naam</th>
          <th>E-mail</th>
          <th>Rol</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.membershipId} className="border-t">
            <td className="py-2 font-medium">
              {m.name}
              {m.userId === currentUserId ? " (jij)" : ""}
            </td>
            <td>{m.email}</td>
            <td>
              <NativeSelect value={m.role} disabled={pending} onChange={(e) => run(() => setMemberRole(m.membershipId, e.target.value))} className="w-44" aria-label={`Rol van ${m.name}`}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BrandingForm({ settings, logoSrc }: { settings: ResolvedOrgSettings["branding"]; logoSrc: string | null }) {
  const { run, pending } = useAction();
  const [b, setB] = useState(settings);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-48 items-center justify-center rounded border bg-muted">{logoSrc ? <img src={logoSrc} alt="Logo" className="max-h-16 max-w-44 object-contain" /> : <span className="text-xs text-muted-foreground">Geen logo</span>}</div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Upload className="size-4" /> Logo uploaden
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              await run(() => uploadLogo(fd));
            }}
          />
        </label>
        {logoSrc ? (
          <Button variant="ghost" size="icon" aria-label="Logo verwijderen" onClick={() => run(() => removeLogo())}>
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bedrijfsnaam in verslag" htmlFor="b-company">
          <Input id="b-company" value={b.companyName} onChange={(e) => setB({ ...b, companyName: e.target.value })} />
        </Field>
        <Field label="Voettekst" htmlFor="b-footer">
          <Input id="b-footer" value={b.footerText} onChange={(e) => setB({ ...b, footerText: e.target.value })} />
        </Field>
        <Field label="Hoofdkleur" htmlFor="b-primary">
          <div className="flex gap-2">
            <input type="color" value={b.primaryColor} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} className="h-8 w-12 rounded border" aria-label="Hoofdkleur kiezen" />
            <Input id="b-primary" value={b.primaryColor} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Accentkleur" htmlFor="b-accent">
          <div className="flex gap-2">
            <input type="color" value={b.accentColor} onChange={(e) => setB({ ...b, accentColor: e.target.value })} className="h-8 w-12 rounded border" aria-label="Accentkleur kiezen" />
            <Input id="b-accent" value={b.accentColor} onChange={(e) => setB({ ...b, accentColor: e.target.value })} />
          </div>
        </Field>
      </div>
      <div className="rounded-lg border p-4" aria-label="Voorbeeld">
        <div className="flex items-center justify-between border-b-2 pb-1" style={{ borderColor: b.primaryColor }}>
          <span className="font-bold" style={{ color: b.primaryColor }}>
            {b.companyName || "Bedrijfsnaam"}
          </span>
          <span className="text-xs text-muted-foreground">Schouwverslag</span>
        </div>
        <p className="mt-2 text-xs" style={{ color: b.accentColor }}>
          SCHOUWVERSLAG
        </p>
        <p className="mt-6 border-t pt-1 text-[10px] text-muted-foreground">{b.footerText || "Voettekst"} · Pagina 1 van 12</p>
      </div>
      <Button className="w-fit" disabled={pending} onClick={() => run(() => updateOrgSettings("branding", { ...b, logoUrl: settings.logoUrl }))}>
        <Save /> Huisstijl opslaan
      </Button>
    </div>
  );
}

export function AiSettingsForm({ settings, aiConfigured }: { settings: ResolvedOrgSettings["ai"]; aiConfigured: boolean }) {
  const { run, pending } = useAction();
  const [a, setA] = useState(settings);
  const toggles: [keyof typeof a, string, string][] = [
    ["captureAnalysis", "Foto- en video-analyse", "Bijschrift, beschrijving, typeplaat-OCR, mogelijke bevindingen, privacy-signalering"],
    ["transcription", "Transcriptie van spraak", "Nederlandse transcriptie met tijdstempels, koppeling aan foto's, extractie van bevindingen/metingen/acties"],
    ["reportSynthesis", "Verslagvoorstel", "Gestructureerd verslag met samenvatting, aandachtspunten, installatiebeschrijving en afrekenvoorstellen"],
  ];
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {!aiConfigured ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Er is geen OPENAI_API_KEY ingesteld: alle AI-stappen worden overgeslagen en de app maakt een basisverslag uit de vastgelegde gegevens.</p> : null}
      {toggles.map(([k, label, hint]) => (
        <label key={k} className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block font-medium">{label}</span>
            <span className="text-sm text-muted-foreground">{hint}</span>
          </span>
          <Switch checked={Boolean(a[k])} onCheckedChange={(v) => setA({ ...a, [k]: Boolean(v) })} aria-label={label} />
        </label>
      ))}
      <Field label="Extra instructies voor de verslag-AI (organisatiebreed)" htmlFor="ai-extra" hint="Bijv. vaste terminologie, schrijfstijl of verplichte aandachtspunten van de opdrachtgever.">
        <Textarea id="ai-extra" rows={4} value={a.extraInstructions} onChange={(e) => setA({ ...a, extraInstructions: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => run(() => updateOrgSettings("ai", a))}>
          <Save /> Opslaan
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            const res = await run(() => processAiQueueNow());
            if (res.ok) toast.message(`${res.data.processed} job(s) verwerkt, ${res.data.failed} mislukt`);
          }}
        >
          <Play /> Wachtrij nu verwerken
        </Button>
      </div>
    </div>
  );
}

export function ExportSettingsForm({ settings }: { settings: ResolvedOrgSettings["export"] }) {
  const { run, pending } = useAction();
  const [e, setE] = useState(settings);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Field label="Bevindingen in verslag groeperen" htmlFor="ex-group">
        <NativeSelect id="ex-group" value={e.findingsGrouping} onChange={(x) => setE({ ...e, findingsGrouping: x.target.value as "thema" | "locatie" })}>
          <option value="thema">Per thema (categorie)</option>
          <option value="locatie">Per locatie</option>
        </NativeSelect>
      </Field>
      <Field label="Papierformaat" htmlFor="ex-paper">
        <NativeSelect id="ex-paper" value={e.paperSize} onChange={(x) => setE({ ...e, paperSize: x.target.value as "A4" | "LETTER" })}>
          <option value="A4">A4</option>
          <option value="LETTER">Letter</option>
        </NativeSelect>
      </Field>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        Fotoregister als bijlage
        <Switch checked={e.includePhotoRegister} onCheckedChange={(v) => setE({ ...e, includePhotoRegister: Boolean(v) })} />
      </label>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        Transcriptie als bijlage
        <Switch checked={e.includeTranscript} onCheckedChange={(v) => setE({ ...e, includeTranscript: Boolean(v) })} />
      </label>
      <Button className="w-fit" disabled={pending} onClick={() => run(() => updateOrgSettings("export", e))}>
        <Save /> Opslaan
      </Button>
    </div>
  );
}

export function PrivacyForm({ settings }: { settings: ResolvedOrgSettings["privacy"] }) {
  const { run, pending } = useAction();
  const [months, setMonths] = useState(settings.retentionMonths);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Field label="Bewaartermijn schouwgegevens (maanden)" htmlFor="pr-months" hint="Schouwen ouder dan deze termijn worden inclusief alle media, verslagen en exports automatisch verwijderd (dagelijkse taak).">
        <Input id="pr-months" type="number" min={1} max={240} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
      </Field>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => run(() => updateOrgSettings("privacy", { retentionMonths: months }))}>
          <Save /> Opslaan
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            if (!confirm("Bewaartermijn nu toepassen? Verlopen schouwen worden definitief verwijderd.")) return;
            const res = await run(() => runRetentionNow());
            if (res.ok) toast.message(`${res.data.inspections} schouw(en) en ${res.data.files} bestand(en) verwijderd`);
          }}
        >
          Nu toepassen
        </Button>
      </div>
    </div>
  );
}

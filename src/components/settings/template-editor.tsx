"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { deleteTemplate, duplicateTemplate, saveTemplate } from "@/app/(app)/instellingen/templates/actions";
import { CHECKLIST_ANSWER_TYPES, CHECKLIST_ANSWER_TYPE_LABELS, TEMPLATE_PHASES, TEMPLATE_PHASE_LABELS } from "@/lib/domain";
import { STATION_COMPONENTS, STATION_COMPONENT_LABELS } from "@/lib/ai/schemas";
import type { TemplateInput } from "@/lib/validation/template";

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

function RowControls({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Rij omhoog" onClick={onUp}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Rij omlaag" onClick={onDown}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Rij verwijderen" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

export function TemplateEditor({ id, initial }: { id: string; initial: TemplateInput }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [t, setT] = useState<TemplateInput>(initial);
  const set = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) => setT((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => saveTemplate(id, t))}>
          <Save /> Opslaan
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => duplicateTemplate(id), { onSuccess: (d) => router.push(`/instellingen/templates/${d.id}`), refresh: false })}
        >
          <Copy /> Kopiëren
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={async () => {
            if (!confirm("Template verwijderen?")) return;
            await run(() => deleteTemplate(id), { onSuccess: () => router.push("/instellingen/templates"), refresh: false });
          }}
        >
          <Trash2 /> Verwijderen
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Naam" htmlFor="tpl-name">
          <Input id="tpl-name" value={t.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Fase" htmlFor="tpl-phase">
          <NativeSelect id="tpl-phase" value={t.phase} onChange={(e) => set("phase", e.target.value as TemplateInput["phase"])}>
            {TEMPLATE_PHASES.map((p) => (
              <option key={p} value={p}>
                {TEMPLATE_PHASE_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Beschrijving" htmlFor="tpl-desc" className="md:col-span-2">
          <Input id="tpl-desc" value={t.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Doeltekst voor het verslag" htmlFor="tpl-purpose" className="md:col-span-2">
          <Textarea id="tpl-purpose" rows={3} value={t.purposeText} onChange={(e) => set("purposeText", e.target.value)} />
        </Field>
        <Field label="Specifieke AI-instructies" htmlFor="tpl-ai" className="md:col-span-2" hint="Worden toegevoegd aan de systeemprompt bij de verslag-synthese.">
          <Textarea id="tpl-ai" rows={3} value={t.aiInstructions} onChange={(e) => set("aiInstructions", e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-6 md:col-span-2">
          {(
            [
              ["isStation", "Stationsschouw (installatiebeschrijving + as-built)"],
              ["isBilling", "Afrekenonderbouwing"],
              ["active", "Actief (zichtbaar bij schouw starten)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={t[key]} onCheckedChange={(v) => set(key, Boolean(v))} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Checklist ({t.checklist.length})</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set("checklist", [...t.checklist, { question: "", answerType: "yes_no_na", options: [], photoRequired: false, required: true }])}
          >
            <Plus /> Vraag
          </Button>
        </div>
        {t.checklist.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-start">
            <span className="w-6 pt-1.5 text-sm text-muted-foreground">{i + 1}.</span>
            <div className="grid flex-1 gap-2 md:grid-cols-[1fr_180px]">
              <Input
                value={c.question}
                placeholder="Vraag"
                aria-label={`Vraag ${i + 1}`}
                onChange={(e) => set("checklist", t.checklist.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
              />
              <NativeSelect
                value={c.answerType}
                aria-label="Antwoordtype"
                onChange={(e) => set("checklist", t.checklist.map((x, j) => (j === i ? { ...x, answerType: e.target.value as typeof c.answerType } : x)))}
              >
                {CHECKLIST_ANSWER_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {CHECKLIST_ANSWER_TYPE_LABELS[a]}
                  </option>
                ))}
              </NativeSelect>
              {c.answerType === "choice" ? (
                <Input
                  className="md:col-span-2"
                  value={c.options.join("; ")}
                  placeholder="Keuzes, gescheiden door ;"
                  aria-label="Keuzes"
                  onChange={(e) =>
                    set(
                      "checklist",
                      t.checklist.map((x, j) => (j === i ? { ...x, options: e.target.value.split(";").map((s) => s.trim()).filter(Boolean) } : x)),
                    )
                  }
                />
              ) : null}
              <div className="flex gap-4 text-sm md:col-span-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={c.photoRequired}
                    onCheckedChange={(v) => set("checklist", t.checklist.map((x, j) => (j === i ? { ...x, photoRequired: Boolean(v) } : x)))}
                  />
                  Foto verplicht
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={c.required}
                    onCheckedChange={(v) => set("checklist", t.checklist.map((x, j) => (j === i ? { ...x, required: Boolean(v) } : x)))}
                  />
                  Antwoord verplicht
                </label>
              </div>
            </div>
            <RowControls
              onUp={() => set("checklist", move(t.checklist, i, -1))}
              onDown={() => set("checklist", move(t.checklist, i, 1))}
              onRemove={() => set("checklist", t.checklist.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Shotlist — verplichte foto&apos;s ({t.shots.length})</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set("shots", [...t.shots, { groupName: "Algemeen", title: "", description: "", required: true, stationComponent: null }])}
          >
            <Plus /> Shot
          </Button>
        </div>
        {t.shots.map((s, i) => (
          <div key={s.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-start">
            <span className="w-6 pt-1.5 text-sm text-muted-foreground">{i + 1}.</span>
            <div className="grid flex-1 gap-2 md:grid-cols-[160px_1fr_200px]">
              <Input
                value={s.groupName}
                aria-label="Groep"
                placeholder="Groep"
                onChange={(e) => set("shots", t.shots.map((x, j) => (j === i ? { ...x, groupName: e.target.value } : x)))}
              />
              <Input
                value={s.title}
                aria-label="Titel"
                placeholder="Titel van het shot"
                onChange={(e) => set("shots", t.shots.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <NativeSelect
                value={s.stationComponent ?? ""}
                aria-label="Stationscomponent"
                onChange={(e) => set("shots", t.shots.map((x, j) => (j === i ? { ...x, stationComponent: e.target.value || null } : x)))}
              >
                <option value="">Geen stationscomponent</option>
                {STATION_COMPONENTS.map((c) => (
                  <option key={c} value={c}>
                    {STATION_COMPONENT_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
              <Input
                className="md:col-span-2"
                value={s.description}
                placeholder="Toelichting voor de schouwer (optioneel)"
                aria-label="Toelichting"
                onChange={(e) => set("shots", t.shots.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={s.required} onCheckedChange={(v) => set("shots", t.shots.map((x, j) => (j === i ? { ...x, required: Boolean(v) } : x)))} />
                Verplicht
              </label>
            </div>
            <RowControls
              onUp={() => set("shots", move(t.shots, i, -1))}
              onDown={() => set("shots", move(t.shots, i, 1))}
              onRemove={() => set("shots", t.shots.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Verslagsecties ({t.sections.length})</h2>
          <Button variant="outline" size="sm" onClick={() => set("sections", [...t.sections, { key: "", title: "", aiHint: "" }])}>
            <Plus /> Sectie
          </Button>
        </div>
        {t.sections.map((s, i) => (
          <div key={s.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-start">
            <span className="w-6 pt-1.5 text-sm text-muted-foreground">{i + 1}.</span>
            <div className="grid flex-1 gap-2 md:grid-cols-[180px_1fr]">
              <Input
                value={s.key}
                aria-label="Sleutel"
                placeholder="sleutel"
                className="font-mono text-xs"
                onChange={(e) => set("sections", t.sections.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              />
              <Input
                value={s.title}
                aria-label="Titel"
                placeholder="Titel"
                onChange={(e) => set("sections", t.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <Input
                className="md:col-span-2"
                value={s.aiHint}
                placeholder="Aanwijzing voor AI (optioneel)"
                aria-label="AI-aanwijzing"
                onChange={(e) => set("sections", t.sections.map((x, j) => (j === i ? { ...x, aiHint: e.target.value } : x)))}
              />
            </div>
            <RowControls
              onUp={() => set("sections", move(t.sections, i, -1))}
              onDown={() => set("sections", move(t.sections, i, 1))}
              onRemove={() => set("sections", t.sections.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </section>

      <div>
        <Button disabled={pending} onClick={() => run(() => saveTemplate(id, t))}>
          <Save /> Opslaan
        </Button>
      </div>
    </div>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { restoreStandardTemplates } from "@/app/(app)/instellingen/templates/actions";

export function TemplateListActions() {
  const { run, pending } = useAction();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        Templates bepalen doel, checklist, verplichte foto&apos;s (shotlist), verslagopbouw en AI-instructies per schouwtype.
      </p>
      <Button variant="outline" disabled={pending} onClick={() => run(() => restoreStandardTemplates())}>
        <RotateCcw /> Standaardtemplates aanvullen
      </Button>
    </div>
  );
}

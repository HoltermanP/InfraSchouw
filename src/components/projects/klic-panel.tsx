"use client";

import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { deleteKlic, importKlic, setKlicVisible } from "@/app/(app)/projecten/[id]/actions-klic";
import { fmtDateTime } from "@/lib/format";

export function KlicPanel({ projectId, imports, canEdit }: { projectId: string; imports: { id: string; name: string; meldingnummer: string | null; featureCount: number; visible: boolean; createdAt: string }[]; canEdit: boolean }) {
  const { run, pending } = useAction();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Upload een KLIC-levering (ZIP of IMKL-GML). De kabels en leidingen verschijnen als kaartlaag op de project- en schouwkaarten, in de kleur van het thema (NEN 1010/KLIC).
      </p>
      {canEdit ? (
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Upload className="size-4" /> KLIC-levering uploaden
          <input
            type="file"
            accept=".zip,.xml,.gml"
            className="hidden"
            disabled={pending}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              const res = await run(() => importKlic(projectId, fd));
              if (res.ok) toast.message(`${res.data.count} objecten ingelezen`);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
      <ul className="flex flex-col gap-2">
        {imports.length === 0 ? <li className="text-sm text-muted-foreground">Nog geen KLIC-leveringen.</li> : null}
        {imports.map((k) => (
          <li key={k.id} className="flex items-center gap-3 rounded border p-2 text-sm">
            <div className="flex-1">
              <p className="font-medium">{k.meldingnummer ? `KLIC ${k.meldingnummer}` : k.name}</p>
              <p className="text-xs text-muted-foreground">
                {k.featureCount} objecten · {fmtDateTime(k.createdAt)}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              Tonen
              <Switch checked={k.visible} disabled={!canEdit || pending} onCheckedChange={(v) => run(() => setKlicVisible(k.id, Boolean(v)))} />
            </label>
            {canEdit ? (
              <Button size="icon-sm" variant="ghost" aria-label="Verwijderen" onClick={() => confirm("KLIC-laag verwijderen?") && run(() => deleteKlic(k.id))}>
                <Trash2 />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

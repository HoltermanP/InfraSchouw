"use client";

import { useState } from "react";
import { Copy, Link2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import { createShareLink, revokeShareLink } from "@/app/(app)/schouwen/[id]/verslag/actions";
import { fmtDate, fmtDateTime } from "@/lib/format";

export type ShareLinkRow = { id: string; label: string | null; expiresAt: string; revokedAt: string | null; lastAccessedAt: string | null; accessCount: number; createdAt: string };

export function ShareLinksPanel({ reportId, links, canManage }: { reportId: string; links: ShareLinkRow[]; canManage: boolean }) {
  const { run, pending } = useAction();
  const [days, setDays] = useState("30");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3" data-testid="share-panel">
      <p className="text-xs text-muted-foreground">Een deellink geeft alleen-lezen toegang tot het definitieve verslag, zonder account. Links verlopen automatisch en zijn intrekbaar.</p>
      {canManage ? (
        <div className="flex flex-col gap-2 rounded border p-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Omschrijving (bijv. gemeente Zwolle)" aria-label="Omschrijving deellink" />
          <div className="flex gap-2">
            <NativeSelect value={days} onChange={(e) => setDays(e.target.value)} aria-label="Geldigheid">
              <option value="7">7 dagen geldig</option>
              <option value="30">30 dagen geldig</option>
              <option value="90">90 dagen geldig</option>
              <option value="365">1 jaar geldig</option>
            </NativeSelect>
            <Button
              disabled={pending}
              data-testid="create-share-link"
              onClick={() =>
                run(() => createShareLink(reportId, Number(days), label || null), {
                  onSuccess: (d) => {
                    setCreated(new URL(d.path, window.location.origin).toString());
                    setLabel("");
                  },
                })
              }
            >
              <Link2 /> Maak deellink
            </Button>
          </div>
          {created ? (
            <div className="rounded bg-emerald-50 p-2 text-xs dark:bg-emerald-950/30">
              <p className="mb-1 font-semibold">Kopieer de link nu — hij wordt maar één keer getoond:</p>
              <div className="flex gap-1">
                <Input value={created} readOnly className="h-7 text-xs" data-testid="share-url" aria-label="Deellink" />
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Kopieer"
                  onClick={() => {
                    void navigator.clipboard.writeText(created);
                    toast.success("Gekopieerd");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {links.map((l) => {
          const expired = new Date(l.expiresAt) < new Date();
          return (
            <li key={l.id} className="rounded border p-2 text-xs">
              <p className="font-medium">{l.label ?? "Deellink"}</p>
              <p className="text-muted-foreground">
                Aangemaakt {fmtDate(l.createdAt)} · {l.revokedAt ? `ingetrokken ${fmtDate(l.revokedAt)}` : expired ? "verlopen" : `geldig tot ${fmtDate(l.expiresAt)}`} · {l.accessCount}× bekeken
                {l.lastAccessedAt ? ` (laatst ${fmtDateTime(l.lastAccessedAt)})` : ""}
              </p>
              {canManage && !l.revokedAt && !expired ? (
                <Button size="xs" variant="ghost" className="mt-1" disabled={pending} onClick={() => run(() => revokeShareLink(l.id))} data-testid="revoke-share-link">
                  <Ban /> Intrekken
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

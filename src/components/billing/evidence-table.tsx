"use client";

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form/field";
import { BillingStatusBadge, AiProposalBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { addEvidence, deleteEvidence, setEvidence } from "@/app/(app)/projecten/[id]/afrekening/actions";
import type { BillingEvidenceStatus } from "@/lib/domain";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EvidenceRow = {
  id: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  status: BillingEvidenceStatus;
  source: string;
  confidence: number | null;
  remark: string | null;
  photos: { id: string; seq: number | null; thumb: string | null }[];
  inspectionId: string;
  inspectionTitle?: string;
  inspectionDate?: string;
};

export function EvidenceTable({ rows, canConfirm, canEdit, showInspection = false }: { rows: EvidenceRow[]; canConfirm: boolean; canEdit: boolean; showInspection?: boolean }) {
  const { run, pending } = useAction();
  const [qty, setQty] = useState<Record<string, string>>({});
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nog geen afrekenbewijs.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" data-testid="evidence-table">
        <thead className="bg-muted text-xs">
          <tr>
            <th className="px-2 py-2 text-left">Post</th>
            <th className="px-2 py-2 text-right">Hoeveelheid</th>
            <th className="px-2 py-2 text-right">Bedrag</th>
            <th className="px-2 py-2 text-left">Bewijs</th>
            {showInspection ? <th className="px-2 py-2 text-left">Schouw</th> : null}
            <th className="px-2 py-2 text-left">Status</th>
            <th className="w-32" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("border-t", r.status === "afgewezen" && "opacity-60")} data-testid="evidence-row">
              <td className="px-2 py-1">
                <span className="font-mono text-xs">{r.itemCode}</span> {r.itemDescription}
                {r.remark ? <p className="text-xs text-muted-foreground">{r.remark}</p> : null}
              </td>
              <td className="px-2 py-1 text-right">
                {canEdit && r.status === "voorgesteld" ? (
                  <Input
                    className="ml-auto h-7 w-24 text-right"
                    inputMode="decimal"
                    value={qty[r.id] ?? String(r.quantity)}
                    onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      if (Number.isFinite(v) && v !== r.quantity) void run(() => setEvidence(r.id, { quantity: v }));
                    }}
                    aria-label={`Hoeveelheid ${r.itemCode}`}
                  />
                ) : (
                  `${fmtNumber(r.quantity)} ${r.unit}`
                )}
              </td>
              <td className="px-2 py-1 text-right">{fmtCurrency(r.quantity * r.unitPrice)}</td>
              <td className="px-2 py-1">
                <div className="flex gap-1">
                  {r.photos.map((p) => (p.thumb ? <img key={p.id} src={p.thumb} alt={`Foto ${p.seq}`} title={`Foto ${p.seq}`} className="size-9 rounded object-cover" loading="lazy" /> : null))}
                </div>
              </td>
              {showInspection ? (
                <td className="px-2 py-1 text-xs">
                  <a href={`/schouwen/${r.inspectionId}/afrekening`} className="hover:underline">
                    {r.inspectionTitle}
                  </a>
                  <br />
                  {fmtDate(r.inspectionDate)}
                </td>
              ) : null}
              <td className="px-2 py-1">
                <div className="flex flex-col items-start gap-1">
                  <BillingStatusBadge status={r.status} />
                  {r.source === "ai" ? <AiProposalBadge /> : null}
                  {r.confidence !== null ? <span className="text-[10px] text-muted-foreground">zekerheid {Math.round(r.confidence * 100)}%</span> : null}
                </div>
              </td>
              <td className="px-1">
                <div className="flex justify-end gap-0.5">
                  {canConfirm && r.status !== "bevestigd" ? (
                    <Button size="icon-xs" variant="ghost" aria-label="Bevestigen" title="Bevestigen" disabled={pending} onClick={() => run(() => setEvidence(r.id, { status: "bevestigd" }))} data-testid="confirm-evidence">
                      <Check />
                    </Button>
                  ) : null}
                  {canConfirm && r.status !== "afgewezen" ? (
                    <Button size="icon-xs" variant="ghost" aria-label="Afwijzen" title="Afwijzen" disabled={pending} onClick={() => run(() => setEvidence(r.id, { status: "afgewezen" }))}>
                      <X />
                    </Button>
                  ) : null}
                  {canConfirm && r.status !== "voorgesteld" ? (
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setEvidence(r.id, { status: "voorgesteld" }))}>
                      Heropen
                    </Button>
                  ) : null}
                  {canEdit && (r.status !== "bevestigd" || canConfirm) ? (
                    <Button size="icon-xs" variant="ghost" aria-label="Verwijderen" disabled={pending} onClick={() => confirm("Bewijsregel verwijderen?") && run(() => deleteEvidence(r.id))}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AddEvidenceButton({ inspectionId, items, photos }: { inspectionId: string; items: { id: string; code: string; description: string; unit: string }[]; photos: { id: string; seq: number | null; thumb: string | null }[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [remark, setRemark] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={items.length === 0} data-testid="add-evidence">
        <Plus /> Bewijsregel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Afrekenbewijs vastleggen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Afrekenpost" htmlFor="ev-item" className="sm:col-span-2">
              <NativeSelect id="ev-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} – {i.description}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={`Hoeveelheid (${items.find((i) => i.id === itemId)?.unit ?? ""})`} htmlFor="ev-qty">
              <Input id="ev-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Toelichting" htmlFor="ev-remark" className="sm:col-span-3">
              <Input id="ev-remark" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </Field>
          </div>
          <p className="text-sm font-medium">Bewijsfoto&apos;s</p>
          <div className="grid max-h-60 grid-cols-6 gap-2 overflow-y-auto">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected.includes(p.id)}
                aria-label={`Foto ${p.seq}`}
                onClick={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                className={cn("relative aspect-square overflow-hidden rounded border", selected.includes(p.id) && "ring-2 ring-primary")}
              >
                {p.thumb ? <img src={p.thumb} alt="" className="size-full object-cover" loading="lazy" /> : null}
                <span className="absolute right-0 bottom-0 bg-black/60 px-1 text-[10px] text-white">{p.seq}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !itemId}
              onClick={() =>
                run(() => addEvidence(inspectionId, { billingItemId: itemId, quantity: Number(quantity.replace(",", ".")), captureIds: selected, remark: remark || null }), {
                  onSuccess: () => {
                    setOpen(false);
                    setSelected([]);
                    setRemark("");
                  },
                })
              }
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

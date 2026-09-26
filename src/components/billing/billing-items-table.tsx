"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Upload, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form/field";
import { useAction } from "@/hooks/use-action";
import { deleteBillingItem, importBillingItems, saveBillingItem } from "@/app/(app)/projecten/[id]/afrekening/actions";
import type { BillingOverviewRow } from "@/lib/billing/import";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BillingItemsTable({ projectId, rows, totals, canEdit }: { projectId: string; rows: BillingOverviewRow[]; totals: { planned: number; demonstrated: number; difference: number }; canEdit: boolean }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<BillingOverviewRow | "new" | null>(null);
  const [form, setForm] = useState({ code: "", description: "", unit: "st", unitPrice: "0", plannedQuantity: "0" });
  const open = (r: BillingOverviewRow | "new") => {
    setEditing(r);
    setForm(r === "new" ? { code: "", description: "", unit: "st", unitPrice: "0", plannedQuantity: "0" } : { code: r.code, description: r.description, unit: r.unit, unitPrice: String(r.unitPrice), plannedQuantity: String(r.planned) });
  };
  const n = (v: string) => Number(v.replace(",", "."));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <>
            <Button onClick={() => open("new")}>
              <Plus /> Afrekenpost
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
              <Upload className="size-4" /> Importeer Excel/CSV
              <input
                type="file"
                accept=".xlsx,.csv,text/csv"
                className="hidden"
                data-testid="billing-import"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.set("file", f);
                  const res = await run(() => importBillingItems(projectId, fd), { refresh: true });
                  if (res.ok) {
                    toast.success(`${res.data.created} nieuw, ${res.data.updated} bijgewerkt`);
                    if (res.data.errors.length) toast.warning(`${res.data.errors.length} regel(s) overgeslagen: ${res.data.errors.slice(0, 3).map((x) => `r${x.row} ${x.message}`).join(" · ")}`);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </>
        ) : null}
        <Button variant="outline" render={<a href={`/api/exports/projects/${projectId}/billing-xlsx`} download data-testid="export-billing-xlsx" />}>
          <FileSpreadsheet /> Excel afrekenonderbouwing
        </Button>
        <Button variant="outline" render={<a href={`/api/exports/projects/${projectId}/billing-pdf`} download data-testid="export-billing-pdf" />}>
          <FileText /> PDF-bijlage bewijsfoto&apos;s
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" data-testid="billing-overview">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="px-2 py-2 text-left">Post</th>
              <th className="px-2 py-2 text-left">Omschrijving</th>
              <th className="px-2 py-2 text-right">Eenheidsprijs</th>
              <th className="px-2 py-2 text-right">Gepland</th>
              <th className="px-2 py-2 text-right">Aangetoond</th>
              <th className="px-2 py-2 text-right">Voorgesteld</th>
              <th className="px-2 py-2 text-right">Verschil</th>
              <th className="px-2 py-2 text-right">Bedrag gepland</th>
              <th className="px-2 py-2 text-right">Bedrag aangetoond</th>
              {canEdit ? <th className="w-16" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1 font-mono text-xs">{r.code}</td>
                <td className="px-2 py-1">{r.description}</td>
                <td className="px-2 py-1 text-right">{fmtCurrency(r.unitPrice)}</td>
                <td className="px-2 py-1 text-right">
                  {fmtNumber(r.planned)} {r.unit}
                </td>
                <td className="px-2 py-1 text-right font-medium">
                  {fmtNumber(r.demonstrated)} {r.unit}
                </td>
                <td className="px-2 py-1 text-right text-violet-700">{r.proposed ? `${fmtNumber(r.proposed)} ${r.unit}` : "—"}</td>
                <td className={cn("px-2 py-1 text-right", r.difference < 0 ? "text-amber-700" : r.difference > 0 ? "text-red-700" : "text-emerald-700")}>{fmtNumber(r.difference)}</td>
                <td className="px-2 py-1 text-right">{fmtCurrency(r.plannedAmount)}</td>
                <td className="px-2 py-1 text-right">{fmtCurrency(r.demonstratedAmount)}</td>
                {canEdit ? (
                  <td className="px-1">
                    <div className="flex">
                      <Button size="icon-xs" variant="ghost" aria-label={`Bewerk ${r.code}`} onClick={() => open(r)}>
                        <Pencil />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Verwijder ${r.code}`} onClick={() => confirm(`Post ${r.code} verwijderen?`) && run(() => deleteBillingItem(r.id))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/50 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={7}>
                Totaal
              </td>
              <td className="px-2 py-2 text-right">{fmtCurrency(totals.planned)}</td>
              <td className="px-2 py-2 text-right">{fmtCurrency(totals.demonstrated)}</td>
              {canEdit ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nieuwe afrekenpost" : "Afrekenpost bewerken"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Postcode" htmlFor="b-code">
              <Input id="b-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Eenheid" htmlFor="b-unit">
              <Input id="b-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
            <Field label="Omschrijving" htmlFor="b-desc" className="sm:col-span-2">
              <Input id="b-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Eenheidsprijs (€)" htmlFor="b-price">
              <Input id="b-price" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            </Field>
            <Field label="Geplande hoeveelheid" htmlFor="b-qty">
              <Input id="b-qty" inputMode="decimal" value={form.plannedQuantity} onChange={(e) => setForm({ ...form, plannedQuantity: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => saveBillingItem(projectId, editing === "new" || !editing ? null : editing.id, { code: form.code, description: form.description, unit: form.unit, unitPrice: n(form.unitPrice), plannedQuantity: n(form.plannedQuantity) }), {
                  onSuccess: () => setEditing(null),
                })
              }
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

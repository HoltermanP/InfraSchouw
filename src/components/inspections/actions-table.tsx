"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AiProposalBadge } from "@/components/common/status-badges";
import { useAction } from "@/hooks/use-action";
import { acceptAllProposals, deleteAction, saveAction, setActionField, type ActionInput } from "@/app/(app)/schouwen/actions";
import { ACTION_STATUSES, ACTION_STATUS_LABELS, type ActionStatus } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

export type ActionRow = { id: string; description: string; owner: string | null; dueDate: string | null; status: ActionStatus; findingIds: string[]; aiAccepted: boolean; inspectionId: string; inspectionTitle?: string };

function ActionDialog({ inspectionId, initial, findings, onClose }: { inspectionId: string; initial: ActionRow | null; findings: { id: string; title: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [a, setA] = useState<ActionInput>({
    description: initial?.description ?? "",
    owner: initial?.owner ?? "",
    dueDate: initial?.dueDate ?? null,
    status: initial?.status ?? "open",
    findingIds: initial?.findingIds ?? [],
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Actiepunt bewerken" : "Nieuw actiepunt"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wat" htmlFor="a-desc" className="sm:col-span-2">
            <Textarea id="a-desc" rows={2} value={a.description} onChange={(e) => setA({ ...a, description: e.target.value })} />
          </Field>
          <Field label="Wie (eigenaar)" htmlFor="a-owner">
            <Input id="a-owner" value={a.owner ?? ""} onChange={(e) => setA({ ...a, owner: e.target.value || null })} />
          </Field>
          <Field label="Wanneer (deadline)" htmlFor="a-due">
            <Input id="a-due" type="date" value={a.dueDate ?? ""} onChange={(e) => setA({ ...a, dueDate: e.target.value || null })} />
          </Field>
          <Field label="Status" htmlFor="a-status">
            <NativeSelect id="a-status" value={a.status} onChange={(e) => setA({ ...a, status: e.target.value as ActionStatus })}>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACTION_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Bij bevinding" htmlFor="a-finding">
            <NativeSelect id="a-finding" value={a.findingIds?.[0] ?? ""} onChange={(e) => setA({ ...a, findingIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">Geen</option>
              {findings.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={pending || !a.description.trim()} onClick={() => run(() => saveAction(inspectionId, initial?.id ?? null, a), { onSuccess: onClose })}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActionsTable({
  inspectionId,
  rows,
  findings,
  canEdit,
  showInspection = false,
}: {
  inspectionId: string | null;
  rows: ActionRow[];
  findings: { id: string; title: string }[];
  canEdit: boolean;
  showInspection?: boolean;
}) {
  const [editing, setEditing] = useState<ActionRow | "new" | null>(null);
  const { run, pending } = useAction();
  const proposals = rows.filter((r) => !r.aiAccepted).length;
  return (
    <div className="flex flex-col gap-3">
      {canEdit && inspectionId ? (
        <div className="flex gap-2">
          <Button onClick={() => setEditing("new")}>
            <Plus /> Actiepunt
          </Button>
          {proposals ? (
            <Button variant="outline" disabled={pending} onClick={() => run(() => acceptAllProposals(inspectionId, "actions"))}>
              <Check /> Alle AI-voorstellen accepteren ({proposals})
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wat</TableHead>
              <TableHead>Wie</TableHead>
              <TableHead>Wanneer</TableHead>
              <TableHead>Status</TableHead>
              {showInspection ? <TableHead className="hidden md:table-cell">Schouw</TableHead> : null}
              {canEdit ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Geen actiepunten.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-md">
                    {r.description}
                    {!r.aiAccepted ? <AiProposalBadge className="ml-2" /> : null}
                  </TableCell>
                  <TableCell>{r.owner ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.dueDate)}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <NativeSelect value={r.status} onChange={(e) => run(() => setActionField(r.id, { status: e.target.value }))} className="w-36" aria-label="Status">
                        {ACTION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ACTION_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      ACTION_STATUS_LABELS[r.status]
                    )}
                  </TableCell>
                  {showInspection ? (
                    <TableCell className="hidden md:table-cell">
                      <a href={`/schouwen/${r.inspectionId}/acties`} className="text-sm hover:underline">
                        {r.inspectionTitle}
                      </a>
                    </TableCell>
                  ) : null}
                  {canEdit ? (
                    <TableCell>
                      <div className="flex gap-1">
                        {!r.aiAccepted ? (
                          <Button size="icon-sm" variant="ghost" aria-label="Accepteer AI-voorstel" onClick={() => run(() => setActionField(r.id, { aiAccepted: true }))}>
                            <Check />
                          </Button>
                        ) : null}
                        {inspectionId ? (
                          <Button size="icon-sm" variant="ghost" aria-label="Bewerken" onClick={() => setEditing(r)}>
                            <Pencil />
                          </Button>
                        ) : null}
                        <Button size="icon-sm" variant="ghost" aria-label="Verwijderen" onClick={() => confirm("Actiepunt verwijderen?") && run(() => deleteAction(r.id))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {editing && inspectionId ? <ActionDialog inspectionId={inspectionId} initial={editing === "new" ? null : editing} findings={findings} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

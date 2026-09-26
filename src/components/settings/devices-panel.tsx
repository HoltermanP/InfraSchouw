"use client";

import { useState } from "react";
import { Ban, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { createDevice, revokeDevice } from "@/app/(app)/instellingen/apparaten/actions";
import { DEVICE_KINDS, DEVICE_KIND_LABELS, type DeviceKind } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export type DeviceRow = { id: string; name: string; kind: DeviceKind; userName: string; tokenPrefix: string; lastSeenAt: string | null; revokedAt: string | null; createdAt: string };

export function DevicesPanel({ devices, users }: { devices: DeviceRow[]; users: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>("meta-rayban");
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam (bijv. Ray-Ban Sanne)" className="w-56" aria-label="Naam apparaat" />
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as DeviceKind)} className="w-64" aria-label="Soort">
          {DEVICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {DEVICE_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} className="w-48" aria-label="Gekoppelde gebruiker">
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        <Button disabled={pending || !name.trim()} onClick={() => run(() => createDevice({ name, kind, userId }), { onSuccess: (d) => {
          setToken(d.token);
          setName("");
        } })} data-testid="create-device">
          <Plus /> Apparaat koppelen
        </Button>
      </div>
      {token ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
          <p className="font-semibold">Apparaattoken — kopieer het nu, het wordt niet opnieuw getoond:</p>
          <div className="mt-2 flex gap-2">
            <Input value={token} readOnly className="font-mono text-xs" data-testid="device-token" aria-label="Apparaattoken" />
            <Button size="icon" variant="outline" aria-label="Kopieer token" onClick={() => {
              void navigator.clipboard.writeText(token);
              toast.success("Gekopieerd");
            }}>
              <Copy />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Gebruik het als <code>Authorization: Bearer &lt;token&gt;</code> voor <code>POST /api/ingest/glasses</code>. Zie docs/SMART_GLASSES.md.</p>
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apparaat</TableHead>
              <TableHead>Gebruiker</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Laatst gezien</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nog geen apparaten.
                </TableCell>
              </TableRow>
            ) : (
              devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{DEVICE_KIND_LABELS[d.kind]}</p>
                  </TableCell>
                  <TableCell>{d.userName}</TableCell>
                  <TableCell className="font-mono text-xs">isg_{d.tokenPrefix}_…</TableCell>
                  <TableCell>{d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "Nooit"}</TableCell>
                  <TableCell>{d.revokedAt ? <span className="text-destructive">Ingetrokken</span> : "Actief"}</TableCell>
                  <TableCell>
                    {!d.revokedAt ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Token intrekken" onClick={() => confirm("Token intrekken? Het apparaat kan dan niets meer insturen.") && run(() => revokeDevice(d.id))}>
                        <Ban />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

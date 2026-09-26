"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import { addProjectMember, removeProjectMember } from "@/app/(app)/projecten/actions";

export function ProjectTeamControls({ projectId, candidates }: { projectId: string; candidates: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [userId, setUserId] = useState(candidates[0]?.id ?? "");
  const [role, setRole] = useState("teamlid");
  if (candidates.length === 0) return <p className="text-sm text-muted-foreground">Alle organisatieleden zitten al in het team.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} className="w-56" aria-label="Gebruiker">
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Input value={role} onChange={(e) => setRole(e.target.value)} className="w-44" aria-label="Rol in project" placeholder="Rol in project" />
      <Button disabled={pending || !userId} onClick={() => run(() => addProjectMember({ projectId, userId, projectRole: role }))}>
        <UserPlus /> Toevoegen
      </Button>
    </div>
  );
}

export function RemoveMemberButton({ projectId, userId }: { projectId: string; userId: string }) {
  const { run, pending } = useAction();
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Verwijder uit team" disabled={pending} onClick={() => run(() => removeProjectMember(projectId, userId))}>
      <Trash2 />
    </Button>
  );
}

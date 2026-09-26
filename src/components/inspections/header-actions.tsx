"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2, RefreshCw, Trash2, Flag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import { deleteInspectionCompletely, finishInspectionInBackend, linkInspectionToProject, rerunProcessing } from "@/app/(app)/schouwen/actions";

export function LinkProjectButton({ inspectionId, currentProjectId, projects }: { inspectionId: string; currentProjectId: string | null; projects: { id: string; number: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(currentProjectId ?? projects[0]?.id ?? "");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" data-testid="link-project" />}>
        <Link2 /> {currentProjectId ? "Projectkoppeling" : "Koppel aan project"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schouw koppelen aan project</DialogTitle>
          <DialogDescription>De schouw, bevindingen en acties worden aan het project toegevoegd en verschijnen op de projectkaart.</DialogDescription>
        </DialogHeader>
        <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.number} – {p.name}
            </option>
          ))}
        </NativeSelect>
        <DialogFooter>
          {currentProjectId ? (
            <Button variant="ghost" disabled={pending} onClick={() => run(() => linkInspectionToProject(inspectionId, null), { onSuccess: () => setOpen(false) })}>
              Ontkoppelen
            </Button>
          ) : null}
          <Button disabled={pending || !projectId} onClick={() => run(() => linkInspectionToProject(inspectionId, projectId), { onSuccess: () => setOpen(false) })} data-testid="confirm-link-project">
            Koppelen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProcessingButtons({ inspectionId, status }: { inspectionId: string; status: string }) {
  const { run, pending } = useAction();
  if (status === "lopend") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => finishInspectionInBackend(inspectionId))}>
        <Flag /> Afronden
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" disabled={pending} onClick={() => run(() => rerunProcessing(inspectionId, "report"))} data-testid="rerun-report">
        <Sparkles /> Verslagvoorstel opnieuw
      </Button>
      <Button variant="ghost" size="icon" title="Alle AI-stappen opnieuw uitvoeren" aria-label="Alle AI-stappen opnieuw" disabled={pending} onClick={() => run(() => rerunProcessing(inspectionId, "all"))}>
        <RefreshCw />
      </Button>
    </>
  );
}

export function DeleteInspectionButton({ inspectionId, title }: { inspectionId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Schouw volledig verwijderen (AVG)" title="Volledig verwijderen (AVG)" />}>
        <Trash2 />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schouw volledig verwijderen</DialogTitle>
          <DialogDescription>
            AVG-verwijderverzoek: de schouw, alle foto&apos;s, video&apos;s, audio, transcripties, handtekeningen, verslagen en exports worden definitief gewist. Dit kan niet ongedaan worden gemaakt. Typ de titel om te bevestigen.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded bg-muted p-2 text-sm font-medium">{title}</p>
        <Input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} aria-label="Bevestig titel" />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || confirmTitle.trim() !== title.trim()}
            onClick={() => run(() => deleteInspectionCompletely(inspectionId, confirmTitle), { onSuccess: () => router.push("/schouwen"), refresh: false })}
          >
            Definitief verwijderen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

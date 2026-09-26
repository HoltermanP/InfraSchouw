"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { deleteProject } from "@/app/(app)/projecten/actions";

export function DeleteProjectButton({ id }: { id: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button
      variant="destructive"
      className="mt-3"
      disabled={pending}
      onClick={async () => {
        if (!confirm("Weet je zeker dat je dit project wilt verwijderen?")) return;
        await run(() => deleteProject(id), { onSuccess: () => router.push("/projecten"), refresh: false });
      }}
    >
      Verwijder project
    </Button>
  );
}

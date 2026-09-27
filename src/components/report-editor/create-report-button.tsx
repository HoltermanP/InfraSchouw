"use client";

import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { createBaselineReport } from "@/app/(app)/schouwen/[id]/verslag/actions";

export function CreateReportButton({ inspectionId, ai = false }: { inspectionId: string; ai?: boolean }) {
  const { run, pending } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => createBaselineReport(inspectionId))} data-testid="create-baseline-report">
      {ai ? (
        <>
          <Sparkles /> Verslag maken met AI
        </>
      ) : (
        <>
          <FileText /> Basisverslag maken
        </>
      )}
    </Button>
  );
}

"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { createBaselineReport } from "@/app/(app)/schouwen/[id]/verslag/actions";

export function CreateReportButton({ inspectionId }: { inspectionId: string }) {
  const { run, pending } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => createBaselineReport(inspectionId))} data-testid="create-baseline-report">
      <FileText /> Basisverslag maken
    </Button>
  );
}

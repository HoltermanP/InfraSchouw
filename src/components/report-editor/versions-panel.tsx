"use client";

import { useState } from "react";
import { GitCompare, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { getVersionDiff, restoreReportVersion } from "@/app/(app)/schouwen/[id]/verslag/actions";
import { REPORT_STATUS_LABELS, type ReportStatus } from "@/lib/domain";
import type { SectionDiff } from "@/lib/report/diff";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type VersionRow = { id: string; versionNumber: number; status: ReportStatus; author: string | null; createdAt: string; note: string | null; inspectionId: string };

export function VersionsPanel({ reportId, versions, currentVersionId, readOnly, dirty }: { reportId: string; versions: VersionRow[]; currentVersionId: string | null; readOnly: boolean; dirty: boolean }) {
  const { run, pending } = useAction();
  const [diff, setDiff] = useState<{ from: number; to: number; sections: SectionDiff[] } | null>(null);
  return (
    <div className="flex flex-col gap-3" data-testid="versions-panel">
      <ul className="flex flex-col gap-1">
        {versions.map((v, i) => {
          const prev = versions[i + 1];
          return (
            <li key={v.id} className={cn("rounded border p-2 text-xs", v.id === currentVersionId && "border-primary bg-primary/5")}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  Versie {v.versionNumber} {v.id === currentVersionId ? "(huidig)" : ""}
                </span>
                <span className="text-muted-foreground">{REPORT_STATUS_LABELS[v.status]}</span>
              </div>
              <p className="text-muted-foreground">
                {fmtDateTime(v.createdAt)} · {v.author ?? "AI"}
              </p>
              {v.note ? <p>{v.note}</p> : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {prev ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={async () => {
                      const res = await getVersionDiff(reportId, prev.id, v.id);
                      if (res.ok) setDiff(res.data);
                    }}
                  >
                    <GitCompare /> Verschil t.o.v. v{prev.versionNumber}
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" render={<a href={`/api/exports/inspections/${v.inspectionId}/pdf?version=${v.id}`} />}>
                  <Download /> PDF
                </Button>
                {!readOnly && v.id !== currentVersionId ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending || dirty}
                    data-testid={`restore-${v.versionNumber}`}
                    onClick={() => confirm(`Versie ${v.versionNumber} terugzetten? Er wordt een nieuwe versie gemaakt met deze inhoud.`) && run(() => restoreReportVersion(reportId, v.id))}
                  >
                    <RotateCcw /> Terugzetten
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {diff ? (
        <div className="rounded border p-2" data-testid="version-diff">
          <p className="mb-2 text-sm font-semibold">
            Verschillen versie {diff.from} → {diff.to}
          </p>
          {diff.sections.filter((s) => s.status !== "unchanged").length === 0 ? <p className="text-xs text-muted-foreground">Geen tekstuele verschillen.</p> : null}
          {diff.sections
            .filter((s) => s.status !== "unchanged")
            .map((s) => (
              <div key={s.key} className="mb-2">
                <p className="text-xs font-semibold">
                  {s.title} <span className="font-normal text-muted-foreground">({s.status === "added" ? "toegevoegd" : s.status === "removed" ? "verwijderd" : "gewijzigd"})</span>
                </p>
                <p className="text-xs whitespace-pre-wrap">
                  {s.parts.map((p, i) => (
                    <span key={i} className={cn(p.type === "added" && "bg-green-100 text-green-900", p.type === "removed" && "bg-red-100 text-red-900 line-through")}>
                      {p.text}
                    </span>
                  ))}
                </p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

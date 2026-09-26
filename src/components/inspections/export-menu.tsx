"use client";

import { Download, FileText, FileSpreadsheet, FileArchive, Map, FileType, Share2 } from "lucide-react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ExportMenu({ inspectionId, reportId, canShare }: { inspectionId: string; reportId: string | null; canShare: boolean }) {
  const base = `/api/exports/inspections/${inspectionId}`;
  const items = [
    { href: `${base}/pdf`, label: "PDF-verslag", icon: FileText, needsReport: true },
    { href: `${base}/docx`, label: "Word (.docx)", icon: FileType, needsReport: true },
    { href: `${base}/xlsx`, label: "Excel (bevindingen, acties, fotoregister)", icon: FileSpreadsheet, needsReport: false },
    { href: `${base}/zip`, label: "ZIP (originele media + metadata + PDF)", icon: FileArchive, needsReport: false },
    { href: `${base}/geojson`, label: "GeoJSON (GIS)", icon: Map, needsReport: false },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" data-testid="export-menu" />}>
        <Download /> Exporteren
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Exporteren</DropdownMenuLabel>
        {items.map((i) => (
          <DropdownMenuItem key={i.href} disabled={i.needsReport && !reportId} render={<a href={i.href} download data-testid={`export-${i.href.split("/").pop()}`} />}>
            <i.icon /> {i.label}
          </DropdownMenuItem>
        ))}
        {canShare && reportId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={`/schouwen/${inspectionId}/verslag?delen=1`} />}>
              <Share2 /> Deellink beheren
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { createContext, useContext } from "react";
import type { CaptureDto } from "@/lib/report/dto";
import type { ReportMeta } from "@/lib/report/types";
import type { FindingCategory, FindingStatus, Priority } from "@/lib/domain";

export type EditorFinding = {
  id: string;
  nr: number;
  title: string;
  description: string;
  recommendation: string | null;
  priority: Priority;
  category: FindingCategory;
  status: FindingStatus;
  captureIds: string[];
  aiAccepted: boolean;
};

export type DataSummary = {
  actions: number;
  checklist: { total: number; answered: number };
  photos: number;
  measurements: number;
  segments: number;
  participants: number;
  station: { code: string; described: boolean } | null;
  asbuilt: { conform: number; afwijkend: number; nietVastgesteld: number } | null;
  billing: number;
};

export type ReportEditorCtx = {
  inspectionId: string;
  reportId: string;
  captures: Map<string, CaptureDto>;
  findings: Map<string, EditorFinding>;
  meta: ReportMeta;
  mapSnapshotUrl: string | null;
  readOnly: boolean;
  summary: DataSummary;
  canRegenerate: boolean;
  onRegenerate: (key: string, title: string, edited: boolean) => void;
};

export const ReportEditorContext = createContext<ReportEditorCtx | null>(null);

export function useReportEditor() {
  const ctx = useContext(ReportEditorContext);
  if (!ctx) throw new Error("ReportEditorContext ontbreekt");
  return ctx;
}

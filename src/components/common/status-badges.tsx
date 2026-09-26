import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ACTION_STATUS_LABELS,
  AI_JOB_STATUS_LABELS,
  BILLING_EVIDENCE_STATUS_LABELS,
  FINDING_CATEGORY_LABELS,
  FINDING_STATUS_LABELS,
  INSPECTION_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  ASBUILT_STATUS_LABELS,
  type ActionStatus,
  type AiJobStatus,
  type AsbuiltStatus,
  type BillingEvidenceStatus,
  type FindingCategory,
  type FindingStatus,
  type InspectionStatus,
  type Priority,
  type ProjectStatus,
  type ReportStatus,
} from "@/lib/domain";

const tone = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
} as const;

function Pill({ t, children, className }: { t: keyof typeof tone; children: React.ReactNode; className?: string }) {
  return <Badge className={cn("border-transparent font-medium", tone[t], className)}>{children}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = priority === "hoog" ? "red" : priority === "midden" ? "amber" : "green";
  return <Pill t={t}>{PRIORITY_LABELS[priority]}</Pill>;
}
export function CategoryBadge({ category }: { category: FindingCategory }) {
  return <Pill t="gray">{FINDING_CATEGORY_LABELS[category]}</Pill>;
}
export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return <Pill t={status === "open" ? "red" : status === "in_behandeling" ? "amber" : "green"}>{FINDING_STATUS_LABELS[status]}</Pill>;
}
export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <Pill t={status === "open" ? "red" : status === "in_uitvoering" ? "amber" : "green"}>{ACTION_STATUS_LABELS[status]}</Pill>;
}
export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const t = status === "lopend" ? "blue" : status === "afgerond" ? "amber" : status === "verwerkt" ? "green" : "gray";
  return <Pill t={t}>{INSPECTION_STATUS_LABELS[status]}</Pill>;
}
export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const t = status === "concept" ? "violet" : status === "in_bewerking" ? "blue" : status === "ter_review" ? "amber" : status === "definitief" ? "green" : "gray";
  return <Pill t={t}>{REPORT_STATUS_LABELS[status]}</Pill>;
}
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Pill t={status === "actief" ? "green" : status === "gepauzeerd" ? "amber" : "gray"}>{PROJECT_STATUS_LABELS[status]}</Pill>;
}
export function BillingStatusBadge({ status }: { status: BillingEvidenceStatus }) {
  return <Pill t={status === "bevestigd" ? "green" : status === "afgewezen" ? "red" : "violet"}>{BILLING_EVIDENCE_STATUS_LABELS[status]}</Pill>;
}
export function AsbuiltBadge({ status }: { status: AsbuiltStatus }) {
  return <Pill t={status === "conform" ? "green" : status === "afwijkend" ? "red" : "gray"}>{ASBUILT_STATUS_LABELS[status]}</Pill>;
}
export function AiJobBadge({ status }: { status: AiJobStatus }) {
  const t = status === "succeeded" ? "green" : status === "failed" ? "red" : status === "skipped" ? "gray" : "blue";
  return <Pill t={t}>{AI_JOB_STATUS_LABELS[status]}</Pill>;
}
export function AiProposalBadge({ className }: { className?: string }) {
  return (
    <Pill t="violet" className={className}>
      AI-voorstel
    </Pill>
  );
}

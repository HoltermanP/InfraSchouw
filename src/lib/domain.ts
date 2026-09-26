/**
 * Shared domain vocabulary (client + server). Values are stored in the
 * database; labels are the Dutch UI texts.
 */

export const ROLES = ["admin", "projectleider", "schouwer", "lezer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Beheerder",
  projectleider: "Projectleider",
  schouwer: "Schouwer",
  lezer: "Lezer",
};
const ROLE_RANK: Record<Role, number> = { lezer: 0, schouwer: 1, projectleider: 2, admin: 3 };
export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const CONTRACT_FORMS = ["UAV-GC", "RAW", "UAV 2012", "anders"] as const;
export type ContractForm = (typeof CONTRACT_FORMS)[number];

export const PROJECT_PHASES = [
  "initiatief",
  "ontwerp",
  "voorbereiding",
  "uitvoering",
  "oplevering",
  "nazorg",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];
export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  initiatief: "Initiatief",
  ontwerp: "Ontwerp",
  voorbereiding: "Voorbereiding",
  uitvoering: "Uitvoering",
  oplevering: "Oplevering",
  nazorg: "Nazorg",
};

export const PROJECT_STATUSES = ["actief", "gepauzeerd", "afgerond", "gearchiveerd"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  actief: "Actief",
  gepauzeerd: "Gepauzeerd",
  afgerond: "Afgerond",
  gearchiveerd: "Gearchiveerd",
};

export const TEMPLATE_PHASES = [
  "initiatief",
  "ontwerp",
  "voor_uitvoering",
  "uitvoering",
  "alle",
  "oplevering",
  "afronding",
  "nazorg",
  "ad_hoc",
] as const;
export type TemplatePhase = (typeof TEMPLATE_PHASES)[number];
export const TEMPLATE_PHASE_LABELS: Record<TemplatePhase, string> = {
  initiatief: "Initiatief",
  ontwerp: "Ontwerp",
  voor_uitvoering: "Voor uitvoering",
  uitvoering: "Uitvoering",
  alle: "Alle fasen",
  oplevering: "Oplevering",
  afronding: "Afronding",
  nazorg: "Nazorg",
  ad_hoc: "Ad hoc",
};

export const INSPECTION_STATUSES = ["lopend", "afgerond", "verwerkt", "gearchiveerd"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];
export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  lopend: "Lopend",
  afgerond: "Afgerond",
  verwerkt: "Verwerkt",
  gearchiveerd: "Gearchiveerd",
};

export const CAPTURE_TYPES = ["photo", "video", "audio", "note", "sketch", "measurement", "scan"] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];
export const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  photo: "Foto",
  video: "Video",
  audio: "Spraak",
  note: "Notitie",
  sketch: "Schets",
  measurement: "Meting",
  scan: "QR/barcode",
};

export const CAPTURE_SOURCES = ["phone-camera", "file-import", "glasses-ingest", "glasses-browser"] as const;
export type CaptureSourceKind = (typeof CAPTURE_SOURCES)[number];
export const CAPTURE_SOURCE_LABELS: Record<CaptureSourceKind, string> = {
  "phone-camera": "Telefooncamera",
  "file-import": "Bestandsimport",
  "glasses-ingest": "Smart glasses (koppeling)",
  "glasses-browser": "Smart glasses (browser)",
};

export const LOCATION_SOURCES = ["gps", "exif", "track-match", "manual", "none"] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];
export const LOCATION_SOURCE_LABELS: Record<LocationSource, string> = {
  gps: "GPS",
  exif: "EXIF",
  "track-match": "Afgeleid uit GPS-track",
  manual: "Handmatig",
  none: "Onbekend",
};

export const PRIORITIES = ["hoog", "midden", "laag"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { hoog: "Hoog", midden: "Midden", laag: "Laag" };
export const PRIORITY_COLORS: Record<Priority, string> = { hoog: "#dc2626", midden: "#f59e0b", laag: "#16a34a" };

export const FINDING_CATEGORIES = [
  "veiligheid",
  "kwaliteit",
  "planning",
  "kosten",
  "omgeving",
  "vergunning",
  "contract",
  "techniek",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  veiligheid: "Veiligheid",
  kwaliteit: "Kwaliteit",
  planning: "Planning",
  kosten: "Kosten",
  omgeving: "Omgeving",
  vergunning: "Vergunning",
  contract: "Contract",
  techniek: "Techniek",
};

export const FINDING_STATUSES = ["open", "in_behandeling", "opgelost"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  in_behandeling: "In behandeling",
  opgelost: "Opgelost",
};

export const ACTION_STATUSES = ["open", "in_uitvoering", "gereed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Open",
  in_uitvoering: "In uitvoering",
  gereed: "Gereed",
};

export const ORIGINS = ["handmatig", "ai", "asbuilt", "transcript", "import"] as const;
export type Origin = (typeof ORIGINS)[number];

export const CHECKLIST_ANSWER_TYPES = ["yes_no_na", "choice", "number", "text"] as const;
export type ChecklistAnswerType = (typeof CHECKLIST_ANSWER_TYPES)[number];
export const CHECKLIST_ANSWER_TYPE_LABELS: Record<ChecklistAnswerType, string> = {
  yes_no_na: "Ja / nee / n.v.t.",
  choice: "Keuze",
  number: "Getal",
  text: "Tekst",
};

export const STATION_TYPES = [
  "compact",
  "inloop",
  "maas",
  "klant",
  "wijk",
  "schakel",
] as const;
export type StationType = (typeof STATION_TYPES)[number];
export const STATION_TYPE_LABELS: Record<StationType, string> = {
  compact: "Compact / prefab",
  inloop: "Inloopstation",
  maas: "Maasstation",
  klant: "Klantstation",
  wijk: "Wijkstation",
  schakel: "Schakelstation",
};

export const STATION_HOUSINGS = ["beton", "kunststof", "metselwerk", "inpandig"] as const;
export type StationHousing = (typeof STATION_HOUSINGS)[number];
export const STATION_HOUSING_LABELS: Record<StationHousing, string> = {
  beton: "Beton",
  kunststof: "Kunststof",
  metselwerk: "Metselwerk",
  inpandig: "Inpandig",
};

export const STATION_STATUSES = ["bestaand", "nieuw", "vervangen", "gesaneerd"] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];
export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  bestaand: "Bestaand",
  nieuw: "Nieuw",
  vervangen: "Vervangen",
  gesaneerd: "Gesaneerd",
};

export const REPORT_STATUSES = ["concept", "in_bewerking", "ter_review", "definitief", "herzien"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  concept: "Concept (AI-voorstel)",
  in_bewerking: "In bewerking",
  ter_review: "Ter review",
  definitief: "Definitief",
  herzien: "Herzien",
};
/** Allowed report status transitions and the minimum role needed. */
export const REPORT_TRANSITIONS: Record<ReportStatus, { to: ReportStatus; minRole: Role; label: string }[]> = {
  concept: [{ to: "in_bewerking", minRole: "schouwer", label: "Start bewerking" }],
  in_bewerking: [{ to: "ter_review", minRole: "schouwer", label: "Ter review aanbieden" }],
  ter_review: [
    { to: "in_bewerking", minRole: "schouwer", label: "Terug naar bewerking" },
    { to: "definitief", minRole: "projectleider", label: "Definitief maken" },
  ],
  definitief: [{ to: "herzien", minRole: "projectleider", label: "Herzien (nieuwe versie)" }],
  herzien: [{ to: "ter_review", minRole: "schouwer", label: "Ter review aanbieden" }],
};

export const BILLING_EVIDENCE_STATUSES = ["voorgesteld", "bevestigd", "afgewezen"] as const;
export type BillingEvidenceStatus = (typeof BILLING_EVIDENCE_STATUSES)[number];
export const BILLING_EVIDENCE_STATUS_LABELS: Record<BillingEvidenceStatus, string> = {
  voorgesteld: "Voorgesteld",
  bevestigd: "Bevestigd",
  afgewezen: "Afgewezen",
};

export const ASBUILT_STATUSES = ["conform", "afwijkend", "niet_vastgesteld"] as const;
export type AsbuiltStatus = (typeof ASBUILT_STATUSES)[number];
export const ASBUILT_STATUS_LABELS: Record<AsbuiltStatus, string> = {
  conform: "Conform",
  afwijkend: "Afwijkend",
  niet_vastgesteld: "Niet vastgesteld",
};

export const AI_JOB_TYPES = [
  "capture_analysis",
  "transcription",
  "report_synthesis",
  "section_regeneration",
] as const;
export type AiJobType = (typeof AI_JOB_TYPES)[number];
export const AI_JOB_TYPE_LABELS: Record<AiJobType, string> = {
  capture_analysis: "Analyse capture",
  transcription: "Transcriptie",
  report_synthesis: "Verslag-synthese",
  section_regeneration: "Sectie hergenereren",
};
export const AI_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "skipped"] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];
export const AI_JOB_STATUS_LABELS: Record<AiJobStatus, string> = {
  queued: "In wachtrij",
  running: "Bezig",
  succeeded: "Gereed",
  failed: "Mislukt",
  skipped: "Overgeslagen",
};

export const EXPORT_TYPES = ["pdf", "docx", "xlsx", "zip", "geojson", "billing_xlsx", "billing_pdf"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const DEVICE_KINDS = ["meta-rayban", "realwear", "vuzix", "overig"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  "meta-rayban": "Meta Ray-Ban (via companion-app)",
  realwear: "RealWear (browser)",
  vuzix: "Vuzix (browser)",
  overig: "Overig",
};

export const MEASUREMENT_KINDS = ["diepte", "lengte", "breedte", "aantal", "hoogte", "overig"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export const MEASUREMENT_KIND_LABELS: Record<MeasurementKind, string> = {
  diepte: "Diepte",
  lengte: "Lengte",
  breedte: "Breedte",
  aantal: "Aantal",
  hoogte: "Hoogte",
  overig: "Overig",
};
export const MEASUREMENT_UNITS = ["cm", "m", "mm", "m2", "st", "kVA", "A", "kV", "V"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

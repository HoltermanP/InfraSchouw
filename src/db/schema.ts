import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  geographyFromGeoJson,
  geographyLineString,
  geographyMultiPolygon,
  geographyPoint,
  id,
  pointFromLatLon,
  timestamps,
} from "./columns";
import {
  ACTION_STATUSES,
  AI_JOB_STATUSES,
  AI_JOB_TYPES,
  BILLING_EVIDENCE_STATUSES,
  CAPTURE_SOURCES,
  CAPTURE_TYPES,
  CHECKLIST_ANSWER_TYPES,
  CONTRACT_FORMS,
  DEVICE_KINDS,
  EXPORT_TYPES,
  FINDING_CATEGORIES,
  FINDING_STATUSES,
  INSPECTION_STATUSES,
  LOCATION_SOURCES,
  ORIGINS,
  PRIORITIES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  REPORT_STATUSES,
  ROLES,
  STATION_HOUSINGS,
  STATION_STATUSES,
  STATION_TYPES,
  TEMPLATE_PHASES,
} from "../lib/domain";
import type { OrgSettings } from "@/lib/org-settings";
import type { ExpectedStationConfig, StationDescriptionDoc } from "@/lib/station/types";
import type { AsbuiltRow } from "@/lib/station/asbuilt";
import type { ReportMeta, TiptapDoc } from "@/lib/report/types";
import type { Weather } from "@/lib/geo/weather";
import type { KlicFeatureCollection } from "@/lib/geo/klic";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const roleEnum = pgEnum("role", ROLES);
export const contractFormEnum = pgEnum("contract_form", CONTRACT_FORMS);
export const projectPhaseEnum = pgEnum("project_phase", PROJECT_PHASES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const templatePhaseEnum = pgEnum("template_phase", TEMPLATE_PHASES);
export const inspectionStatusEnum = pgEnum("inspection_status", INSPECTION_STATUSES);
export const captureTypeEnum = pgEnum("capture_type", CAPTURE_TYPES);
export const captureSourceEnum = pgEnum("capture_source", CAPTURE_SOURCES);
export const locationSourceEnum = pgEnum("location_source", LOCATION_SOURCES);
export const priorityEnum = pgEnum("priority", PRIORITIES);
export const findingCategoryEnum = pgEnum("finding_category", FINDING_CATEGORIES);
export const findingStatusEnum = pgEnum("finding_status", FINDING_STATUSES);
export const actionStatusEnum = pgEnum("action_status", ACTION_STATUSES);
export const originEnum = pgEnum("origin", ORIGINS);
export const checklistAnswerTypeEnum = pgEnum("checklist_answer_type", CHECKLIST_ANSWER_TYPES);
export const stationTypeEnum = pgEnum("station_type", STATION_TYPES);
export const stationHousingEnum = pgEnum("station_housing", STATION_HOUSINGS);
export const stationStatusEnum = pgEnum("station_status", STATION_STATUSES);
export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);
export const billingEvidenceStatusEnum = pgEnum("billing_evidence_status", BILLING_EVIDENCE_STATUSES);
export const aiJobTypeEnum = pgEnum("ai_job_type", AI_JOB_TYPES);
export const aiJobStatusEnum = pgEnum("ai_job_status", AI_JOB_STATUSES);
export const exportTypeEnum = pgEnum("export_type", EXPORT_TYPES);
export const deviceKindEnum = pgEnum("device_kind", DEVICE_KINDS);

// ---------------------------------------------------------------------------
// Tenancy & users
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: id(),
  clerkOrgId: text("clerk_org_id").unique(),
  name: text("name").notNull(),
  slug: text("slug"),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const users = pgTable("users", {
  id: id(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  ...timestamps,
});

const orgRef = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("schouwer"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: orgRef(),
    number: text("number").notNull(),
    name: text("name").notNull(),
    client: text("client"),
    contractForm: contractFormEnum("contract_form").notNull().default("UAV-GC"),
    phase: projectPhaseEnum("phase").notNull().default("ontwerp"),
    status: projectStatusEnum("status").notNull().default("actief"),
    description: text("description"),
    areaGeojson: jsonb("area_geojson").$type<GeoJSON.Polygon | GeoJSON.MultiPolygon>(),
    area: geographyMultiPolygon("area").generatedAlwaysAs(geographyFromGeoJson("area_geojson", "MultiPolygon")),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("projects_org_idx").on(t.orgId),
    uniqueIndex("projects_org_number_uq").on(t.orgId, t.number),
    index("projects_area_gist").using("gist", t.area),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectRole: text("project_role").notNull().default("teamlid"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("project_members_org_idx").on(t.orgId),
    uniqueIndex("project_members_uq").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const inspectionTemplates = pgTable(
  "inspection_templates",
  {
    id: id(),
    orgId: orgRef(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    phase: templatePhaseEnum("phase").notNull(),
    purposeText: text("purpose_text").notNull().default(""),
    aiInstructions: text("ai_instructions").notNull().default(""),
    isStation: boolean("is_station").notNull().default(false),
    isBilling: boolean("is_billing").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("templates_org_idx").on(t.orgId), uniqueIndex("templates_org_key_uq").on(t.orgId, t.key)],
);

const templateRef = () =>
  uuid("template_id")
    .notNull()
    .references(() => inspectionTemplates.id, { onDelete: "cascade" });

export const templateChecklistItems = pgTable(
  "template_checklist_items",
  {
    id: id(),
    orgId: orgRef(),
    templateId: templateRef(),
    sort: integer("sort").notNull().default(0),
    question: text("question").notNull(),
    answerType: checklistAnswerTypeEnum("answer_type").notNull().default("yes_no_na"),
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    photoRequired: boolean("photo_required").notNull().default(false),
    required: boolean("required").notNull().default(true),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("tci_org_idx").on(t.orgId), index("tci_template_idx").on(t.templateId)],
);

export const templateShots = pgTable(
  "template_shots",
  {
    id: id(),
    orgId: orgRef(),
    templateId: templateRef(),
    sort: integer("sort").notNull().default(0),
    groupName: text("group_name").notNull().default("Algemeen"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    required: boolean("required").notNull().default(true),
    stationComponent: text("station_component"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("tshots_org_idx").on(t.orgId), index("tshots_template_idx").on(t.templateId)],
);

export const templateSections = pgTable(
  "template_sections",
  {
    id: id(),
    orgId: orgRef(),
    templateId: templateRef(),
    sort: integer("sort").notNull().default(0),
    key: text("key").notNull(),
    title: text("title").notNull(),
    aiHint: text("ai_hint").notNull().default(""),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("tsections_org_idx").on(t.orgId), index("tsections_template_idx").on(t.templateId)],
);

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------
export const stations = pgTable(
  "stations",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    location: geographyPoint("location").generatedAlwaysAs(pointFromLatLon()),
    owner: text("owner"),
    stationType: stationTypeEnum("station_type").notNull().default("compact"),
    housing: stationHousingEnum("housing").notNull().default("beton"),
    buildYear: integer("build_year"),
    status: stationStatusEnum("status").notNull().default("bestaand"),
    notes: text("notes"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("stations_org_idx").on(t.orgId),
    uniqueIndex("stations_org_code_uq").on(t.orgId, t.code),
    index("stations_project_idx").on(t.projectId),
    index("stations_location_gist").using("gist", t.location),
  ],
);

export const stationExpectedConfigs = pgTable(
  "station_expected_configs",
  {
    id: id(),
    orgId: orgRef(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    config: jsonb("config").$type<ExpectedStationConfig>().notNull(),
    source: originEnum("source").notNull().default("handmatig"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("sec_org_idx").on(t.orgId), uniqueIndex("sec_station_uq").on(t.stationId)],
);

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------
export type InspectionSkip = { kind: "shot" | "checklist"; refId: string; reason: string };
export type DeviceInfo = { userAgent?: string; platform?: string; screen?: string; source?: string };

export const inspections = pgTable(
  "inspections",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: "restrict" }),
    stationId: uuid("station_id").references(() => stations.id, { onDelete: "set null" }),
    inspectorId: uuid("inspector_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: inspectionStatusEnum("status").notNull().default("lopend"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    weather: jsonb("weather").$type<Weather | null>(),
    address: text("address"),
    lat: doublePrecision("start_lat"),
    lon: doublePrecision("start_lon"),
    startLocation: geographyPoint("start_location").generatedAlwaysAs(pointFromLatLon("start_lat", "start_lon")),
    deviceInfo: jsonb("device_info").$type<DeviceInfo>(),
    skipped: jsonb("skipped").$type<InspectionSkip[]>().notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("inspections_org_idx").on(t.orgId),
    index("inspections_project_idx").on(t.projectId),
    index("inspections_template_idx").on(t.templateId),
    index("inspections_station_idx").on(t.stationId),
    index("inspections_inspector_idx").on(t.inspectorId),
    index("inspections_location_gist").using("gist", t.startLocation),
  ],
);

const inspectionRef = () =>
  uuid("inspection_id")
    .notNull()
    .references(() => inspections.id, { onDelete: "cascade" });

export const inspectionParticipants = pgTable(
  "inspection_participants",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    name: text("name").notNull(),
    organization: text("organization"),
    role: text("role"),
    signatureUrl: text("signature_url"),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("participants_org_idx").on(t.orgId), index("participants_inspection_idx").on(t.inspectionId)],
);

export type CaptureMeta = {
  /** Video keyframes extracted client-side (storage keys + offset). */
  keyframes?: { url: string; offsetMs: number }[];
  /** Barcode format for scan captures. */
  scanFormat?: string;
  /** Photo series id (series mode). */
  seriesId?: string;
  /** GPS track recorded during a video. */
  track?: { lat: number; lon: number; t: number }[];
  /** Original file name for imports. */
  fileName?: string;
  width?: number;
  height?: number;
  /** For annotated/sketch captures: the capture they were drawn on. */
  baseCaptureId?: string;
};

export const captures = pgTable(
  "captures",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "cascade" }),
    type: captureTypeEnum("type").notNull(),
    blobUrl: text("blob_url"),
    thumbUrl: text("thumb_url"),
    mime: text("mime"),
    size: integer("size"),
    durationMs: integer("duration_ms"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    location: geographyPoint("location").generatedAlwaysAs(pointFromLatLon()),
    accuracy: doublePrecision("accuracy"),
    heading: doublePrecision("heading"),
    rdX: doublePrecision("rd_x"),
    rdY: doublePrecision("rd_y"),
    locationSource: locationSourceEnum("location_source").notNull().default("none"),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
    source: captureSourceEnum("source").notNull().default("phone-camera"),
    shotId: uuid("shot_id").references(() => templateShots.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    note: text("note"),
    /** Text payload: note content, scan value, measurement label. */
    textContent: text("text_content"),
    parentCaptureId: uuid("parent_capture_id"),
    sort: integer("sort").notNull().default(0),
    /** Photo number in the report (fotonummer), assigned per inspection. */
    seq: integer("seq"),
    hiddenInReport: boolean("hidden_in_report").notNull().default(false),
    exif: jsonb("exif").$type<Record<string, unknown> | null>(),
    meta: jsonb("meta").$type<CaptureMeta>().notNull().default(sql`'{}'::jsonb`),
    deviceId: uuid("device_id"),
    privacyBlurred: boolean("privacy_blurred").notNull().default(false),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("captures_org_idx").on(t.orgId),
    index("captures_inspection_idx").on(t.inspectionId, t.capturedAt),
    index("captures_location_gist").using("gist", t.location),
    index("captures_shot_idx").on(t.shotId),
    index("captures_parent_idx").on(t.parentCaptureId),
  ],
);

const captureRef = () =>
  uuid("capture_id")
    .notNull()
    .references(() => captures.id, { onDelete: "cascade" });

export type AnnotationShape =
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "circle"; cx: number; cy: number; r: number; color: string; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | { kind: "freehand"; points: [number, number][]; color: string; width: number }
  | { kind: "dimension"; x1: number; y1: number; x2: number; y2: number; label: string; color: string; width: number }
  | { kind: "blur"; x: number; y: number; w: number; h: number };
export type AnnotationDrawing = { width: number; height: number; shapes: AnnotationShape[] };

export const captureAnnotations = pgTable(
  "capture_annotations",
  {
    id: id(),
    orgId: orgRef(),
    captureId: captureRef(),
    drawing: jsonb("drawing").$type<AnnotationDrawing>().notNull(),
    renderedUrl: text("rendered_url"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("annotations_org_idx").on(t.orgId), index("annotations_capture_idx").on(t.captureId)],
);

export const captureAnalyses = pgTable(
  "capture_analyses",
  {
    id: id(),
    orgId: orgRef(),
    captureId: captureRef(),
    model: text("model").notNull(),
    version: integer("version").notNull().default(1),
    result: jsonb("result").$type<import("@/lib/ai/schemas").CaptureAnalysis>().notNull(),
    accepted: boolean("accepted").notNull().default(false),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("analyses_org_idx").on(t.orgId), index("analyses_capture_idx").on(t.captureId, t.version)],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "cascade" }),
    captureId: captureRef(),
    language: text("language").notNull().default("nl"),
    text: text("text").notNull(),
    model: text("model").notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("transcripts_org_idx").on(t.orgId),
    uniqueIndex("transcripts_capture_uq").on(t.captureId),
    index("transcripts_inspection_idx").on(t.inspectionId),
  ],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: id(),
    orgId: orgRef(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    text: text("text").notNull(),
    captureIds: uuid("capture_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("segments_org_idx").on(t.orgId),
    index("segments_transcript_idx").on(t.transcriptId),
    index("segments_inspection_idx").on(t.inspectionId, t.startAt),
  ],
);

export const gpsTracks = pgTable(
  "gps_tracks",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    lineGeojson: jsonb("line_geojson").$type<GeoJSON.LineString | null>(),
    line: geographyLineString("line").generatedAlwaysAs(geographyFromGeoJson("line_geojson", "LineString")),
    pointCount: integer("point_count").notNull().default(0),
    lengthM: doublePrecision("length_m").notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("tracks_org_idx").on(t.orgId),
    uniqueIndex("tracks_inspection_uq").on(t.inspectionId),
    index("tracks_line_gist").using("gist", t.line),
  ],
);

export const gpsPoints = pgTable(
  "gps_points",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    location: geographyPoint("location").generatedAlwaysAs(pointFromLatLon()),
    accuracy: doublePrecision("accuracy"),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("gps_points_org_idx").on(t.orgId),
    uniqueIndex("gps_points_uq").on(t.inspectionId, t.recordedAt),
    index("gps_points_location_gist").using("gist", t.location),
  ],
);

export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    /** The measurement capture itself. */
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "cascade" }),
    /** Optional photo the measurement belongs to (e.g. duimstok-foto). */
    photoCaptureId: uuid("photo_capture_id").references(() => captures.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    location: geographyPoint("location").generatedAlwaysAs(pointFromLatLon()),
    measuredAt: timestamp("measured_at", { withTimezone: true, mode: "date" }).notNull(),
    source: originEnum("source").notNull().default("handmatig"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("measurements_org_idx").on(t.orgId),
    index("measurements_inspection_idx").on(t.inspectionId),
    index("measurements_capture_idx").on(t.captureId),
    index("measurements_location_gist").using("gist", t.location),
  ],
);

export const checklistAnswers = pgTable(
  "checklist_answers",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => templateChecklistItems.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<string | number | null>(),
    note: text("note"),
    skippedReason: text("skipped_reason"),
    captureIds: uuid("capture_ids").array().notNull().default(sql`'{}'::uuid[]`),
    answeredAt: timestamp("answered_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("answers_org_idx").on(t.orgId),
    uniqueIndex("answers_inspection_item_uq").on(t.inspectionId, t.itemId),
    index("answers_item_idx").on(t.itemId),
  ],
);

// ---------------------------------------------------------------------------
// Findings & actions
// ---------------------------------------------------------------------------
export const findings = pgTable(
  "findings",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: findingCategoryEnum("category").notNull(),
    priority: priorityEnum("priority").notNull().default("midden"),
    status: findingStatusEnum("status").notNull().default("open"),
    recommendation: text("recommendation"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    location: geographyPoint("location").generatedAlwaysAs(pointFromLatLon()),
    source: originEnum("source").notNull().default("handmatig"),
    /** AI proposals stay flagged until a user accepts them. */
    aiAccepted: boolean("ai_accepted").notNull().default(true),
    confidence: doublePrecision("confidence"),
    seq: integer("seq"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("findings_org_idx").on(t.orgId),
    index("findings_inspection_idx").on(t.inspectionId),
    index("findings_project_idx").on(t.projectId),
    index("findings_location_gist").using("gist", t.location),
  ],
);

export const findingCaptures = pgTable(
  "finding_captures",
  {
    orgId: orgRef(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    captureId: captureRef(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.findingId, t.captureId] }),
    index("finding_captures_org_idx").on(t.orgId),
    index("finding_captures_capture_idx").on(t.captureId),
  ],
);

export const actions = pgTable(
  "actions",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    owner: text("owner"),
    dueDate: date("due_date", { mode: "string" }),
    status: actionStatusEnum("status").notNull().default("open"),
    findingIds: uuid("finding_ids").array().notNull().default(sql`'{}'::uuid[]`),
    source: originEnum("source").notNull().default("handmatig"),
    aiAccepted: boolean("ai_accepted").notNull().default(true),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("actions_org_idx").on(t.orgId),
    index("actions_inspection_idx").on(t.inspectionId),
    index("actions_project_idx").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Station descriptions & as-built
// ---------------------------------------------------------------------------
export const stationDescriptions = pgTable(
  "station_descriptions",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<StationDescriptionDoc>().notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("station_desc_org_idx").on(t.orgId),
    uniqueIndex("station_desc_inspection_uq").on(t.inspectionId),
    index("station_desc_station_idx").on(t.stationId),
  ],
);

export const asbuiltChecks = pgTable(
  "asbuilt_checks",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    rows: jsonb("rows").$type<AsbuiltRow[]>().notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("asbuilt_org_idx").on(t.orgId),
    uniqueIndex("asbuilt_inspection_uq").on(t.inspectionId),
    index("asbuilt_station_idx").on(t.stationId),
  ],
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export const billingItems = pgTable(
  "billing_items",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    plannedQuantity: numeric("planned_quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
    sort: integer("sort").notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("billing_items_org_idx").on(t.orgId),
    uniqueIndex("billing_items_project_code_uq").on(t.projectId, t.code),
  ],
);

export const billingEvidence = pgTable(
  "billing_evidence",
  {
    id: id(),
    orgId: orgRef(),
    billingItemId: uuid("billing_item_id")
      .notNull()
      .references(() => billingItems.id, { onDelete: "cascade" }),
    inspectionId: inspectionRef(),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    captureIds: uuid("capture_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: billingEvidenceStatusEnum("status").notNull().default("voorgesteld"),
    confidence: doublePrecision("confidence"),
    remark: text("remark"),
    source: originEnum("source").notNull().default("handmatig"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("billing_evidence_org_idx").on(t.orgId),
    index("billing_evidence_item_idx").on(t.billingItemId),
    index("billing_evidence_inspection_idx").on(t.inspectionId),
  ],
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export const reports = pgTable(
  "reports",
  {
    id: id(),
    orgId: orgRef(),
    inspectionId: inspectionRef(),
    title: text("title").notNull(),
    status: reportStatusEnum("status").notNull().default("concept"),
    currentVersionId: uuid("current_version_id"),
    mapSnapshotUrl: text("map_snapshot_url"),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    finalExportId: uuid("final_export_id"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("reports_org_idx").on(t.orgId), uniqueIndex("reports_inspection_uq").on(t.inspectionId)],
);

export const reportVersions = pgTable(
  "report_versions",
  {
    id: id(),
    orgId: orgRef(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: jsonb("content").$type<TiptapDoc>().notNull(),
    meta: jsonb("meta").$type<ReportMeta>().notNull(),
    status: reportStatusEnum("status").notNull(),
    /** Null author = generated by AI. */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("report_versions_org_idx").on(t.orgId),
    uniqueIndex("report_versions_uq").on(t.reportId, t.versionNumber),
  ],
);

export const reportExports = pgTable(
  "report_exports",
  {
    id: id(),
    orgId: orgRef(),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => reportVersions.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: exportTypeEnum("type").notNull(),
    blobUrl: text("blob_url").notNull(),
    sha256: text("sha256").notNull(),
    size: integer("size").notNull(),
    archived: boolean("archived").notNull().default(false),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("report_exports_org_idx").on(t.orgId), index("report_exports_report_idx").on(t.reportId)],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    orgId: orgRef(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true, mode: "date" }),
    accessCount: integer("access_count").notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("share_links_org_idx").on(t.orgId), index("share_links_report_idx").on(t.reportId)],
);

// ---------------------------------------------------------------------------
// Smart glasses devices
// ---------------------------------------------------------------------------
export const devices = pgTable(
  "devices",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: deviceKindEnum("kind").notNull().default("meta-rayban"),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("devices_org_idx").on(t.orgId), index("devices_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// AI jobs
// ---------------------------------------------------------------------------
export type AiJobInput = {
  captureId?: string;
  inspectionId?: string;
  reportId?: string;
  sectionKey?: string;
  instruction?: string;
  force?: boolean;
};
export type AiJobOutput = {
  analysisId?: string;
  transcriptId?: string;
  reportVersionId?: string;
  removedCaptureIds?: string[];
  message?: string;
};

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: id(),
    orgId: orgRef(),
    type: aiJobTypeEnum("type").notNull(),
    status: aiJobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    inputRef: jsonb("input_ref").$type<AiJobInput>().notNull(),
    outputRef: jsonb("output_ref").$type<AiJobOutput | null>(),
    error: text("error"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costEstimateUsd: numeric("cost_estimate_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [
    index("ai_jobs_org_idx").on(t.orgId, t.createdAt),
    uniqueIndex("ai_jobs_idempotency_uq").on(t.idempotencyKey),
    index("ai_jobs_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// KLIC & audit
// ---------------------------------------------------------------------------
export const klicImports = pgTable(
  "klic_imports",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    meldingnummer: text("meldingnummer"),
    fileUrl: text("file_url"),
    featureCount: integer("feature_count").notNull().default(0),
    geojson: jsonb("geojson").$type<KlicFeatureCollection>().notNull(),
    visible: boolean("visible").notNull().default(true),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("klic_org_idx").on(t.orgId), index("klic_project_idx").on(t.projectId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary"),
    diff: jsonb("diff").$type<Record<string, unknown> | null>(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index("audit_org_idx").on(t.orgId, t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type InspectionTemplate = typeof inspectionTemplates.$inferSelect;
export type TemplateChecklistItem = typeof templateChecklistItems.$inferSelect;
export type TemplateShot = typeof templateShots.$inferSelect;
export type TemplateSection = typeof templateSections.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Inspection = typeof inspections.$inferSelect;
export type Capture = typeof captures.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ReportVersion = typeof reportVersions.$inferSelect;
export type BillingItem = typeof billingItems.$inferSelect;
export type BillingEvidence = typeof billingEvidence.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;

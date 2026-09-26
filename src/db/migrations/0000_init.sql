CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('open', 'in_uitvoering', 'gereed');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."ai_job_type" AS ENUM('capture_analysis', 'transcription', 'report_synthesis', 'section_regeneration');--> statement-breakpoint
CREATE TYPE "public"."billing_evidence_status" AS ENUM('voorgesteld', 'bevestigd', 'afgewezen');--> statement-breakpoint
CREATE TYPE "public"."capture_source" AS ENUM('phone-camera', 'file-import', 'glasses-ingest', 'glasses-browser');--> statement-breakpoint
CREATE TYPE "public"."capture_type" AS ENUM('photo', 'video', 'audio', 'note', 'sketch', 'measurement', 'scan');--> statement-breakpoint
CREATE TYPE "public"."checklist_answer_type" AS ENUM('yes_no_na', 'choice', 'number', 'text');--> statement-breakpoint
CREATE TYPE "public"."contract_form" AS ENUM('UAV-GC', 'RAW', 'UAV 2012', 'anders');--> statement-breakpoint
CREATE TYPE "public"."device_kind" AS ENUM('meta-rayban', 'realwear', 'vuzix', 'overig');--> statement-breakpoint
CREATE TYPE "public"."export_type" AS ENUM('pdf', 'docx', 'xlsx', 'zip', 'geojson', 'billing_xlsx', 'billing_pdf');--> statement-breakpoint
CREATE TYPE "public"."finding_category" AS ENUM('veiligheid', 'kwaliteit', 'planning', 'kosten', 'omgeving', 'vergunning', 'contract', 'techniek');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'in_behandeling', 'opgelost');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('lopend', 'afgerond', 'verwerkt', 'gearchiveerd');--> statement-breakpoint
CREATE TYPE "public"."location_source" AS ENUM('gps', 'exif', 'track-match', 'manual', 'none');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('handmatig', 'ai', 'asbuilt', 'transcript', 'import');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('hoog', 'midden', 'laag');--> statement-breakpoint
CREATE TYPE "public"."project_phase" AS ENUM('initiatief', 'ontwerp', 'voorbereiding', 'uitvoering', 'oplevering', 'nazorg');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('actief', 'gepauzeerd', 'afgerond', 'gearchiveerd');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('concept', 'in_bewerking', 'ter_review', 'definitief', 'herzien');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'projectleider', 'schouwer', 'lezer');--> statement-breakpoint
CREATE TYPE "public"."station_housing" AS ENUM('beton', 'kunststof', 'metselwerk', 'inpandig');--> statement-breakpoint
CREATE TYPE "public"."station_status" AS ENUM('bestaand', 'nieuw', 'vervangen', 'gesaneerd');--> statement-breakpoint
CREATE TYPE "public"."station_type" AS ENUM('compact', 'inloop', 'maas', 'klant', 'wijk', 'schakel');--> statement-breakpoint
CREATE TYPE "public"."template_phase" AS ENUM('initiatief', 'ontwerp', 'voor_uitvoering', 'uitvoering', 'alle', 'oplevering', 'afronding', 'nazorg', 'ad_hoc');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"project_id" uuid,
	"description" text NOT NULL,
	"owner" text,
	"due_date" date,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"source" "origin" DEFAULT 'handmatig' NOT NULL,
	"ai_accepted" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "ai_job_type" NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_ref" jsonb NOT NULL,
	"output_ref" jsonb,
	"error" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asbuilt_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"rows" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text,
	"diff" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"billing_item_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"capture_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "billing_evidence_status" DEFAULT 'voorgesteld' NOT NULL,
	"confidence" double precision,
	"remark" text,
	"source" "origin" DEFAULT 'handmatig' NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"planned_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"model" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"result" jsonb NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"drawing" jsonb NOT NULL,
	"rendered_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid,
	"type" "capture_type" NOT NULL,
	"blob_url" text,
	"thumb_url" text,
	"mime" text,
	"size" integer,
	"duration_ms" integer,
	"lat" double precision,
	"lon" double precision,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NOT NULL AND "lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography END) STORED,
	"accuracy" double precision,
	"heading" double precision,
	"rd_x" double precision,
	"rd_y" double precision,
	"location_source" "location_source" DEFAULT 'none' NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source" "capture_source" DEFAULT 'phone-camera' NOT NULL,
	"shot_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"text_content" text,
	"parent_capture_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"seq" integer,
	"hidden_in_report" boolean DEFAULT false NOT NULL,
	"exif" jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"device_id" uuid,
	"privacy_blurred" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"value" jsonb,
	"note" text,
	"skipped_reason" text,
	"capture_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "device_kind" DEFAULT 'meta-rayban' NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "finding_captures" (
	"org_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_captures_finding_id_capture_id_pk" PRIMARY KEY("finding_id","capture_id")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "finding_category" NOT NULL,
	"priority" "priority" DEFAULT 'midden' NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"recommendation" text,
	"lat" double precision,
	"lon" double precision,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NOT NULL AND "lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography END) STORED,
	"source" "origin" DEFAULT 'handmatig' NOT NULL,
	"ai_accepted" boolean DEFAULT true NOT NULL,
	"confidence" double precision,
	"seq" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NOT NULL AND "lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography END) STORED,
	"accuracy" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"line_geojson" jsonb,
	"line" geography(LineString,4326) GENERATED ALWAYS AS (CASE WHEN "line_geojson" IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON("line_geojson"), 4326)::geography END) STORED,
	"point_count" integer DEFAULT 0 NOT NULL,
	"length_m" double precision DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"role" text,
	"signature_url" text,
	"signed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"phase" "template_phase" NOT NULL,
	"purpose_text" text DEFAULT '' NOT NULL,
	"ai_instructions" text DEFAULT '' NOT NULL,
	"is_station" boolean DEFAULT false NOT NULL,
	"is_billing" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"template_id" uuid NOT NULL,
	"station_id" uuid,
	"inspector_id" uuid,
	"title" text NOT NULL,
	"status" "inspection_status" DEFAULT 'lopend' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"weather" jsonb,
	"address" text,
	"start_lat" double precision,
	"start_lon" double precision,
	"start_location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "start_lat" IS NOT NULL AND "start_lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("start_lon", "start_lat"), 4326)::geography END) STORED,
	"device_info" jsonb,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "klic_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meldingnummer" text,
	"file_url" text,
	"feature_count" integer DEFAULT 0 NOT NULL,
	"geojson" jsonb NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"capture_id" uuid,
	"photo_capture_id" uuid,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NOT NULL AND "lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography END) STORED,
	"measured_at" timestamp with time zone NOT NULL,
	"source" "origin" DEFAULT 'handmatig' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'schouwer' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text,
	"name" text NOT NULL,
	"slug" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_role" text DEFAULT 'teamlid' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"client" text,
	"contract_form" "contract_form" DEFAULT 'UAV-GC' NOT NULL,
	"phase" "project_phase" DEFAULT 'ontwerp' NOT NULL,
	"status" "project_status" DEFAULT 'actief' NOT NULL,
	"description" text,
	"area_geojson" jsonb,
	"area" geography(MultiPolygon,4326) GENERATED ALWAYS AS (CASE WHEN "area_geojson" IS NOT NULL THEN ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON("area_geojson"), 4326))::geography END) STORED,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid,
	"version_id" uuid,
	"project_id" uuid,
	"type" "export_type" NOT NULL,
	"blob_url" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"meta" jsonb NOT NULL,
	"status" "report_status" NOT NULL,
	"author_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "report_status" DEFAULT 'concept' NOT NULL,
	"current_version_id" uuid,
	"map_snapshot_url" text,
	"locked_at" timestamp with time zone,
	"final_export_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "station_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_expected_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"source" "origin" DEFAULT 'handmatig' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lon" double precision,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NOT NULL AND "lon" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography END) STORED,
	"owner" text,
	"station_type" "station_type" DEFAULT 'compact' NOT NULL,
	"housing" "station_housing" DEFAULT 'beton' NOT NULL,
	"build_year" integer,
	"status" "station_status" DEFAULT 'bestaand' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"question" text NOT NULL,
	"answer_type" "checklist_answer_type" DEFAULT 'yes_no_na' NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"photo_required" boolean DEFAULT false NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"ai_hint" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"group_name" text DEFAULT 'Algemeen' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"station_component" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"inspection_id" uuid,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"capture_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid,
	"capture_id" uuid NOT NULL,
	"language" text DEFAULT 'nl' NOT NULL,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asbuilt_checks" ADD CONSTRAINT "asbuilt_checks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asbuilt_checks" ADD CONSTRAINT "asbuilt_checks_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asbuilt_checks" ADD CONSTRAINT "asbuilt_checks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asbuilt_checks" ADD CONSTRAINT "asbuilt_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_evidence" ADD CONSTRAINT "billing_evidence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_evidence" ADD CONSTRAINT "billing_evidence_billing_item_id_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."billing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_evidence" ADD CONSTRAINT "billing_evidence_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_evidence" ADD CONSTRAINT "billing_evidence_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_evidence" ADD CONSTRAINT "billing_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_analyses" ADD CONSTRAINT "capture_analyses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_analyses" ADD CONSTRAINT "capture_analyses_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_analyses" ADD CONSTRAINT "capture_analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_annotations" ADD CONSTRAINT "capture_annotations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_annotations" ADD CONSTRAINT "capture_annotations_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_annotations" ADD CONSTRAINT "capture_annotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_shot_id_template_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."template_shots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_item_id_template_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."template_checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_captures" ADD CONSTRAINT "finding_captures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_captures" ADD CONSTRAINT "finding_captures_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_captures" ADD CONSTRAINT "finding_captures_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_tracks" ADD CONSTRAINT "gps_tracks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_tracks" ADD CONSTRAINT "gps_tracks_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_tracks" ADD CONSTRAINT "gps_tracks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_participants" ADD CONSTRAINT "inspection_participants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_participants" ADD CONSTRAINT "inspection_participants_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_participants" ADD CONSTRAINT "inspection_participants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klic_imports" ADD CONSTRAINT "klic_imports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klic_imports" ADD CONSTRAINT "klic_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klic_imports" ADD CONSTRAINT "klic_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_photo_capture_id_captures_id_fk" FOREIGN KEY ("photo_capture_id") REFERENCES "public"."captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_version_id_report_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."report_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_descriptions" ADD CONSTRAINT "station_descriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_descriptions" ADD CONSTRAINT "station_descriptions_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_descriptions" ADD CONSTRAINT "station_descriptions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_descriptions" ADD CONSTRAINT "station_descriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_expected_configs" ADD CONSTRAINT "station_expected_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_expected_configs" ADD CONSTRAINT "station_expected_configs_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_expected_configs" ADD CONSTRAINT "station_expected_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_checklist_items" ADD CONSTRAINT "template_checklist_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_checklist_items" ADD CONSTRAINT "template_checklist_items_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_checklist_items" ADD CONSTRAINT "template_checklist_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shots" ADD CONSTRAINT "template_shots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shots" ADD CONSTRAINT "template_shots_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shots" ADD CONSTRAINT "template_shots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_org_idx" ON "actions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "actions_inspection_idx" ON "actions" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "actions_project_idx" ON "actions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_org_idx" ON "ai_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_idempotency_uq" ON "ai_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asbuilt_org_idx" ON "asbuilt_checks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asbuilt_inspection_uq" ON "asbuilt_checks" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "asbuilt_station_idx" ON "asbuilt_checks" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "billing_evidence_org_idx" ON "billing_evidence" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "billing_evidence_item_idx" ON "billing_evidence" USING btree ("billing_item_id");--> statement-breakpoint
CREATE INDEX "billing_evidence_inspection_idx" ON "billing_evidence" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "billing_items_org_idx" ON "billing_items" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_items_project_code_uq" ON "billing_items" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "analyses_org_idx" ON "capture_analyses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "analyses_capture_idx" ON "capture_analyses" USING btree ("capture_id","version");--> statement-breakpoint
CREATE INDEX "annotations_org_idx" ON "capture_annotations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "annotations_capture_idx" ON "capture_annotations" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "captures_org_idx" ON "captures" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "captures_inspection_idx" ON "captures" USING btree ("inspection_id","captured_at");--> statement-breakpoint
CREATE INDEX "captures_location_gist" ON "captures" USING gist ("location");--> statement-breakpoint
CREATE INDEX "captures_shot_idx" ON "captures" USING btree ("shot_id");--> statement-breakpoint
CREATE INDEX "captures_parent_idx" ON "captures" USING btree ("parent_capture_id");--> statement-breakpoint
CREATE INDEX "answers_org_idx" ON "checklist_answers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_inspection_item_uq" ON "checklist_answers" USING btree ("inspection_id","item_id");--> statement-breakpoint
CREATE INDEX "answers_item_idx" ON "checklist_answers" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "devices_org_idx" ON "devices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "finding_captures_org_idx" ON "finding_captures" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "finding_captures_capture_idx" ON "finding_captures" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "findings_org_idx" ON "findings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "findings_inspection_idx" ON "findings" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "findings_project_idx" ON "findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "findings_location_gist" ON "findings" USING gist ("location");--> statement-breakpoint
CREATE INDEX "gps_points_org_idx" ON "gps_points" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_points_uq" ON "gps_points" USING btree ("inspection_id","recorded_at");--> statement-breakpoint
CREATE INDEX "gps_points_location_gist" ON "gps_points" USING gist ("location");--> statement-breakpoint
CREATE INDEX "tracks_org_idx" ON "gps_tracks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_inspection_uq" ON "gps_tracks" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "tracks_line_gist" ON "gps_tracks" USING gist ("line");--> statement-breakpoint
CREATE INDEX "participants_org_idx" ON "inspection_participants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "participants_inspection_idx" ON "inspection_participants" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "templates_org_idx" ON "inspection_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_org_key_uq" ON "inspection_templates" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "inspections_org_idx" ON "inspections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inspections_project_idx" ON "inspections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inspections_template_idx" ON "inspections" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "inspections_station_idx" ON "inspections" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "inspections_inspector_idx" ON "inspections" USING btree ("inspector_id");--> statement-breakpoint
CREATE INDEX "inspections_location_gist" ON "inspections" USING gist ("start_location");--> statement-breakpoint
CREATE INDEX "klic_org_idx" ON "klic_imports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "klic_project_idx" ON "klic_imports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "measurements_org_idx" ON "measurements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "measurements_inspection_idx" ON "measurements" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "measurements_capture_idx" ON "measurements" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "measurements_location_gist" ON "measurements" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_org_idx" ON "project_members" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_uq" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_number_uq" ON "projects" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "projects_area_gist" ON "projects" USING gist ("area");--> statement-breakpoint
CREATE INDEX "report_exports_org_idx" ON "report_exports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "report_exports_report_idx" ON "report_exports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_versions_org_idx" ON "report_versions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_versions_uq" ON "report_versions" USING btree ("report_id","version_number");--> statement-breakpoint
CREATE INDEX "reports_org_idx" ON "reports" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_inspection_uq" ON "reports" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "share_links_org_idx" ON "share_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "share_links_report_idx" ON "share_links" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "station_desc_org_idx" ON "station_descriptions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "station_desc_inspection_uq" ON "station_descriptions" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "station_desc_station_idx" ON "station_descriptions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "sec_org_idx" ON "station_expected_configs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sec_station_uq" ON "station_expected_configs" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "stations_org_idx" ON "stations" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_org_code_uq" ON "stations" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "stations_project_idx" ON "stations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "stations_location_gist" ON "stations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "tci_org_idx" ON "template_checklist_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tci_template_idx" ON "template_checklist_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "tsections_org_idx" ON "template_sections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tsections_template_idx" ON "template_sections" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "tshots_org_idx" ON "template_shots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tshots_template_idx" ON "template_shots" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "segments_org_idx" ON "transcript_segments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "segments_transcript_idx" ON "transcript_segments" USING btree ("transcript_id");--> statement-breakpoint
CREATE INDEX "segments_inspection_idx" ON "transcript_segments" USING btree ("inspection_id","start_at");--> statement-breakpoint
CREATE INDEX "transcripts_org_idx" ON "transcripts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_capture_uq" ON "transcripts" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "transcripts_inspection_idx" ON "transcripts" USING btree ("inspection_id");
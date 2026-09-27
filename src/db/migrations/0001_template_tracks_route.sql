ALTER TYPE "public"."location_source" ADD VALUE 'inspection' BEFORE 'none';--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD COLUMN "tracks_route" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "inspection_templates" SET "tracks_route" = true WHERE "key" IN ('trace', 'oplevering_trace');

import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PostGIS geography columns. The app always reads/writes plain lat/lon (or
 * GeoJSON) columns; the geography columns are *generated* by Postgres from
 * those, so they can never drift and are available for GIST-indexed spatial
 * queries (bbox, within-polygon, distance).
 */
const geography = (kind: "Point" | "Polygon" | "LineString" | "MultiPolygon") =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return `geography(${kind},4326)`;
    },
  });

export const geographyPoint = geography("Point");
export const geographyLineString = geography("LineString");
export const geographyMultiPolygon = geography("MultiPolygon");

/** Generated point from `lat`/`lon` columns (null when either is missing). */
export const pointFromLatLon = (latCol = "lat", lonCol = "lon") =>
  sql.raw(
    `CASE WHEN "${latCol}" IS NOT NULL AND "${lonCol}" IS NOT NULL THEN ST_SetSRID(ST_MakePoint("${lonCol}", "${latCol}"), 4326)::geography END`,
  );

/** Generated geography from a GeoJSON geometry stored in a jsonb column. */
export const geographyFromGeoJson = (col: string, cast: "MultiPolygon" | "LineString") =>
  cast === "MultiPolygon"
    ? sql.raw(
        `CASE WHEN "${col}" IS NOT NULL THEN ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON("${col}"), 4326))::geography END`,
      )
    : sql.raw(
        `CASE WHEN "${col}" IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON("${col}"), 4326)::geography END`,
      );

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const id = () => uuid("id").primaryKey().defaultRandom();

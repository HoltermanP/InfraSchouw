/**
 * drizzle-kit quotes custom PostGIS types ("geography(Point,4326)"), which is
 * invalid SQL. This post-processes generated migrations: unquote the types and
 * make sure the PostGIS extension exists before the first migration runs.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/db/migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
  const path = join(dir, file);
  let sql = readFileSync(path, "utf8");
  const before = sql;
  sql = sql.replace(/"(geography\((?:Point|LineString|Polygon|MultiPolygon),4326\))"/g, "$1");
  if (file.startsWith("0000_") && !sql.includes("CREATE EXTENSION IF NOT EXISTS postgis")) {
    sql = `CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint\n${sql}`;
  }
  if (sql !== before) {
    writeFileSync(path, sql);
    console.log(`fixed ${file}`);
  }
}

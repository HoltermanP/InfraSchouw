// Copies the MapLibre web worker (ES module) and its shared chunk to /public so
// the worker can be loaded from a stable URL (bundlers cannot resolve it at runtime).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = path.join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  if (existsSync(path.join(dist, f))) copyFileSync(path.join(dist, f), path.join(out, f));
}
console.log("maplibre worker gekopieerd naar public/maplibre");

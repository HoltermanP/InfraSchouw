/**
 * Preload for tsx scripts (seed, maintenance): makes `import "server-only"`
 * a no-op outside Next.js, for both CommonJS and ESM resolution.
 */
const Module = require("node:module");
const path = require("node:path");
const empty = path.join(__dirname, "empty.cjs");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return empty;
  return originalResolve.call(this, request, ...rest);
};
if (typeof Module.register === "function") {
  Module.register(
    "data:text/javascript," +
      encodeURIComponent(
        'export async function resolve(s, c, n) { if (s === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }; return n(s, c); }',
      ),
  );
}

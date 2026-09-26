import { withSession, jsonError } from "@/lib/api";
import { serveObject } from "@/lib/media-response";
import { belongsToOrg } from "@/lib/storage";

/** Generic authorised file proxy for org-owned objects (signatures, logos, exports, snapshots). */
export const GET = withSession(async (req, session) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  if (!target) return jsonError(400, "Parameter u ontbreekt.");
  if (!belongsToOrg(target, session.org.id)) return jsonError(404, "Niet gevonden.");
  return serveObject(target, req, { downloadName: url.searchParams.get("name") ?? undefined });
});

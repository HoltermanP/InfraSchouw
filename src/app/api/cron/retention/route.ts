import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { jsonError } from "@/lib/api";
import { purgeExpiredInspections } from "@/lib/privacy";

export const maxDuration = 800;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return jsonError(401, "Niet geautoriseerd.");
  return NextResponse.json(await purgeExpiredInspections());
}

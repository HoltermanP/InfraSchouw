import { NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, stations } from "@/db/schema";
import { getTemplatesFull } from "@/db/queries/templates";
import { withSession } from "@/lib/api";
import { orgPrefix, storageMode } from "@/lib/storage";

/**
 * Everything the offline field app needs, cached in IndexedDB and by the
 * service worker: user/org, templates (checklist, shotlist), projects and
 * stations.
 */
export const GET = withSession(async (_req, session) => {
  const [templates, projectRows, stationRows] = await Promise.all([
    getTemplatesFull(session.ctx),
    db
      .select({ id: projects.id, number: projects.number, name: projects.name, areaGeojson: projects.areaGeojson })
      .from(projects)
      .where(and(eq(projects.orgId, session.org.id), ne(projects.status, "gearchiveerd")))
      .orderBy(asc(projects.number)),
    db
      .select({ id: stations.id, code: stations.code, name: stations.name, projectId: stations.projectId, lat: stations.lat, lon: stations.lon, address: stations.address })
      .from(stations)
      .where(eq(stations.orgId, session.org.id))
      .orderBy(asc(stations.code)),
  ]);
  return NextResponse.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    org: { id: session.org.id, name: session.org.name, field: session.org.settings.field },
    role: session.role,
    storage: { mode: storageMode(), prefix: orgPrefix(session.org.id) },
    templates: templates
      .filter((t) => t.active)
      .map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        phase: t.phase,
        isStation: t.isStation,
        isBilling: t.isBilling,
        checklist: t.checklist.map((c) => ({ id: c.id, question: c.question, answerType: c.answerType, options: c.options, photoRequired: c.photoRequired, required: c.required })),
        shots: t.shots.map((s) => ({ id: s.id, groupName: s.groupName, title: s.title, description: s.description, required: s.required, stationComponent: s.stationComponent })),
      })),
    projects: projectRows,
    stations: stationRows,
    serverTime: new Date().toISOString(),
  });
});

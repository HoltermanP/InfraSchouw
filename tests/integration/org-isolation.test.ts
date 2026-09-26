import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { captures, inspections, projects } from "@/db/schema";
import { assertRole, ForbiddenError, NotFoundError, orgWhere, scoped } from "@/db/scope";
import { ensureStandardTemplates, listTemplates } from "@/db/queries/templates";
import { getProject, listProjects } from "@/db/queries/projects";
import { createTestOrg, dropTestOrgs, hasDb } from "../support/db";

describe.skipIf(!hasDb)("organisation isolation", () => {
  let a: Awaited<ReturnType<typeof createTestOrg>>;
  let b: Awaited<ReturnType<typeof createTestOrg>>;
  let projectB: string;
  let inspectionB: string;

  beforeAll(async () => {
    a = await createTestOrg("A", ["admin", "lezer"]);
    b = await createTestOrg("B", ["admin"]);
    await ensureStandardTemplates(a.org.id);
    await ensureStandardTemplates(b.org.id);
    await scoped(a.ctx.admin).insert(projects, { number: "A-1", name: "Project van A", contractForm: "RAW", phase: "ontwerp" });
    const [p] = await scoped(b.ctx.admin).insert(projects, {
      number: "B-1",
      name: "Geheim project van B",
      contractForm: "UAV-GC",
      phase: "uitvoering",
      areaGeojson: { type: "Polygon", coordinates: [[[6.08, 52.5], [6.12, 52.5], [6.12, 52.53], [6.08, 52.53], [6.08, 52.5]]] },
    });
    projectB = p!.id;
    const [tplB] = await listTemplates(b.ctx.admin);
    const [insp] = await scoped(b.ctx.admin).insert(inspections, { templateId: tplB!.id, projectId: projectB, title: "Schouw B" });
    inspectionB = insp!.id;
    await scoped(b.ctx.admin).insert(captures, {
      inspectionId: inspectionB,
      type: "photo",
      capturedAt: new Date(),
      lat: 52.51,
      lon: 6.1,
    });
  });

  afterAll(async () => {
    await dropTestOrgs([a?.org.id, b?.org.id].filter(Boolean) as string[]);
    await closeDb();
  });

  it("lists only the organisation's own projects", async () => {
    const rowsA = await listProjects(a.ctx.admin);
    expect(rowsA.map((r) => r.project.number)).toEqual(["A-1"]);
    const rowsB = await listProjects(b.ctx.admin);
    expect(rowsB.map((r) => r.project.number)).toEqual(["B-1"]);
  });

  it("cannot read another organisation's project by id", async () => {
    expect(await getProject(a.ctx.admin, projectB)).toBeNull();
    expect(await scoped(a.ctx.admin).findById(projects, projectB)).toBeNull();
    await expect(scoped(a.ctx.admin).getById(inspections, inspectionB)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot update or delete another organisation's data", async () => {
    await expect(scoped(a.ctx.admin).update(projects, projectB, { name: "Gekaapt" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(scoped(a.ctx.admin).remove(projects, projectB)).rejects.toBeInstanceOf(NotFoundError);
    const still = await getProject(b.ctx.admin, projectB);
    expect(still?.name).toBe("Geheim project van B");
  });

  it("does not see captures of another organisation", async () => {
    const own = await scoped(a.ctx.admin).list(captures);
    expect(own).toHaveLength(0);
    const raw = await db.select().from(captures).where(orgWhere(captures, a.ctx.admin, eq(captures.inspectionId, inspectionB)));
    expect(raw).toHaveLength(0);
  });

  it("rejects linking foreign ids", async () => {
    await expect(scoped(a.ctx.admin).assertOwned(inspections, [inspectionB])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("forces the org id on insert even if another is passed", async () => {
    const [row] = await scoped(a.ctx.admin).insert(projects, {
      number: "A-2",
      name: "Poging",
      contractForm: "RAW",
      phase: "ontwerp",
      ...({ orgId: b.org.id } as object),
    });
    expect(row!.orgId).toBe(a.org.id);
  });

  it("stores PostGIS geography generated from GeoJSON and lat/lon", async () => {
    const res = await db.execute<{ area_ok: boolean; point_ok: boolean }>(
      `select (select area is not null from projects where id = '${projectB}') as area_ok,
              (select location is not null from captures where inspection_id = '${inspectionB}' limit 1) as point_ok` as never,
    );
    expect(res.rows[0]).toEqual({ area_ok: true, point_ok: true });
  });

  it("enforces minimum roles", () => {
    expect(() => assertRole(a.ctx.lezer, "schouwer")).toThrow(ForbiddenError);
    expect(() => assertRole(a.ctx.admin, "projectleider")).not.toThrow();
  });
});

import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  aiJobs,
  auditLog,
  billingItems,
  captures,
  devices,
  inspections,
  projectMembers,
  projects,
  stationExpectedConfigs,
  stations,
} from "../../src/db/schema";
import { expectedStationConfigSchema } from "../../src/lib/station/schema";
import type { Role } from "../../src/lib/domain";
import type { Organization } from "../../src/db/schema";

export type SeedBase = { org: Organization; users: Record<Role, { id: string; name: string }> };

/** Project area around Zwolle-Stadshagen (WGS84). */
export const DEMO_AREA: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [6.028, 52.516],
      [6.072, 52.516],
      [6.072, 52.536],
      [6.028, 52.536],
      [6.028, 52.516],
    ],
  ],
};

export const DEMO_BILLING_ITEMS = [
  { code: "01.01", description: "Leveren en leggen MS-kabel 3x1x240 Al XLPE", unit: "m", unitPrice: 38.5, plannedQuantity: 1850 },
  { code: "01.02", description: "Leveren en leggen LS-kabel 4x150 Al", unit: "m", unitPrice: 21.75, plannedQuantity: 640 },
  { code: "02.01", description: "Gestuurde boring Ø160 mm incl. mantelbuis", unit: "m", unitPrice: 112.0, plannedQuantity: 240 },
  { code: "02.02", description: "Mantelbuis Ø160 mm open ontgraving", unit: "m", unitPrice: 18.4, plannedQuantity: 85 },
  { code: "03.01", description: "MS-verbindingsmof 3x1x240 Al", unit: "st", unitPrice: 1450.0, plannedQuantity: 6 },
  { code: "03.02", description: "MS-eindsluiting binnen (T-plug) 240 mm²", unit: "st", unitPrice: 685.0, plannedQuantity: 12 },
  { code: "04.01", description: "Leveren en plaatsen RMU 3K+1T (SF6-vrij)", unit: "st", unitPrice: 28500.0, plannedQuantity: 2 },
  { code: "04.02", description: "Leveren en plaatsen distributietransformator 400 kVA", unit: "st", unitPrice: 14200.0, plannedQuantity: 1 },
  { code: "04.03", description: "Leveren en plaatsen distributietransformator 630 kVA", unit: "st", unitPrice: 17650.0, plannedQuantity: 1 },
  { code: "04.04", description: "Leveren en monteren LS-rek 8 groepen", unit: "st", unitPrice: 4250.0, plannedQuantity: 2 },
  { code: "04.05", description: "Compact station betonbehuizing incl. fundatie", unit: "st", unitPrice: 19800.0, plannedQuantity: 2 },
  { code: "05.01", description: "Opbreken en herstellen klinkerverharding", unit: "m2", unitPrice: 42.0, plannedQuantity: 520 },
  { code: "05.02", description: "Opbreken en herstellen asfaltverharding", unit: "m2", unitPrice: 96.0, plannedQuantity: 60 },
  { code: "05.03", description: "Herstel groenvoorziening / inzaaien berm", unit: "m2", unitPrice: 6.5, plannedQuantity: 300 },
  { code: "06.01", description: "Aardelektrode diepteaarder incl. meting", unit: "st", unitPrice: 540.0, plannedQuantity: 2 },
] as const;

export const DEMO_STATIONS = [
  {
    code: "ZWL-STH-4012",
    name: "MS-station Stadshagen Frankhuizerallee",
    address: "Frankhuizerallee 120, 8043 XB Zwolle",
    lat: 52.52679,
    lon: 6.061347,
    stationType: "compact" as const,
    housing: "beton" as const,
    buildYear: 2026,
    status: "nieuw" as const,
    owner: "Enexis Netbeheer",
    expected: {
      stationstype: "Compact",
      behuizing: "Beton",
      rmu_fabrikant: "Eaton",
      rmu_type: "Xiria 3K+1T",
      aantal_velden: 4,
      velden_functies: ["kabel", "kabel", "kabel", "trafo"],
      isolatiemedium: "vast",
      trafo_aantal: 1,
      trafo_vermogen_kva: 630,
      trafo_fabrikant: "SGB",
      ls_aantal_groepen: 8,
      rtu_aanwezig: true,
      aantal_mv_eindsluitingen: 9,
    },
  },
  {
    code: "ZWL-STH-4013",
    name: "MS-station Stadshagen Werkerlaan",
    address: "Werkerlaan 2, 8043 LT Zwolle",
    lat: 52.534449,
    lon: 6.058166,
    stationType: "compact" as const,
    housing: "beton" as const,
    buildYear: 2026,
    status: "nieuw" as const,
    owner: "Enexis Netbeheer",
    expected: {
      stationstype: "Compact",
      behuizing: "Beton",
      rmu_fabrikant: "Eaton",
      rmu_type: "Xiria 3K+1T",
      aantal_velden: 4,
      velden_functies: ["kabel", "kabel", "kabel", "trafo"],
      isolatiemedium: "vast",
      trafo_aantal: 1,
      trafo_vermogen_kva: 400,
      trafo_fabrikant: "SGB",
      ls_aantal_groepen: 8,
      rtu_aanwezig: false,
      aantal_mv_eindsluitingen: 9,
    },
  },
];

/** Remove all previous demo data for the demo organisation (idempotent re-seed). */
export async function clearDemoData(orgId: string) {
  await db.delete(inspections).where(eq(inspections.orgId, orgId));
  await db.delete(captures).where(eq(captures.orgId, orgId));
  await db.delete(stations).where(eq(stations.orgId, orgId));
  await db.delete(projects).where(eq(projects.orgId, orgId));
  await db.delete(devices).where(eq(devices.orgId, orgId));
  await db.delete(aiJobs).where(eq(aiJobs.orgId, orgId));
  await db.delete(auditLog).where(eq(auditLog.orgId, orgId));
}

export async function seedDemo(base: SeedBase) {
  const { org, users } = base;
  await clearDemoData(org.id);
  const [project] = await db
    .insert(projects)
    .values({
      orgId: org.id,
      number: "P-2026-001",
      name: "Netverzwaring Demo – 10 kV ring",
      client: "Enexis Netbeheer",
      contractForm: "UAV-GC",
      phase: "uitvoering",
      status: "actief",
      description:
        "Verzwaring van het 10 kV-net in Zwolle-Stadshagen: nieuwe MS-ring van circa 1,9 km met twee nieuwe compacte MS-stations, gestuurde boring onder de Frankhuizerallee en herstel van verharding.",
      areaGeojson: DEMO_AREA,
      createdBy: users.projectleider.id,
    })
    .returning();
  await db.insert(projectMembers).values(
    (["projectleider", "schouwer", "admin"] as const).map((r) => ({
      orgId: org.id,
      projectId: project!.id,
      userId: users[r].id,
      projectRole: r === "projectleider" ? "projectleider" : r === "schouwer" ? "toezichthouder" : "adviseur",
      createdBy: users.admin.id,
    })),
  );
  await db.insert(billingItems).values(
    DEMO_BILLING_ITEMS.map((b, i) => ({ ...b, orgId: org.id, projectId: project!.id, sort: i, createdBy: users.projectleider.id })),
  );
  const stationRows = [];
  for (const s of DEMO_STATIONS) {
    const { expected, ...rest } = s;
    const [station] = await db
      .insert(stations)
      .values({ ...rest, orgId: org.id, projectId: project!.id, createdBy: users.projectleider.id })
      .returning();
    await db.insert(stationExpectedConfigs).values({
      orgId: org.id,
      stationId: station!.id,
      config: expectedStationConfigSchema.parse(expected),
      source: "import",
      createdBy: users.projectleider.id,
    });
    stationRows.push(station!);
  }
  const { seedDemoInspections } = await import("./demo-inspections");
  const extra = await seedDemoInspections(base, project!, stationRows);
  return {
    project: project!,
    stations: stationRows,
    summary: [
      `Demoproject ${project!.number} met ${DEMO_BILLING_ITEMS.length} afrekenposten, ${stationRows.length} MS-stations, KLIC-laag en 4 schouwen (tracé – definitief, stationsoplevering – AI-concept, nulmeting – in bewerking, losse calamiteit – ter review).`,
      ...extra,
    ].join("\n"),
  };
}

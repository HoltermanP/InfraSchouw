import "server-only";
import ExcelJS from "exceljs";
import {
  ACTION_STATUS_LABELS,
  BILLING_EVIDENCE_STATUS_LABELS,
  CAPTURE_TYPE_LABELS,
  FINDING_CATEGORY_LABELS,
  FINDING_STATUS_LABELS,
  LOCATION_SOURCE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from "@/lib/domain";
import type { InspectionContext } from "@/lib/report/context";
import { answerLabel } from "@/components/inspections/checklist-labels";

type Col = { header: string; key: string; width: number; numFmt?: string };

export function addSheet(wb: ExcelJS.Workbook, name: string, columns: Col[], rows: Record<string, unknown>[], primary = "0F4C81") {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${primary.replace("#", "")}` } };
  ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.eachRow((row, i) => {
    if (i > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  return ws;
}

/** Excel export of an inspection: findings, actions, photo register, measurements, checklist, billing. */
export async function renderInspectionXlsx(ctx: InspectionContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InfraSchouw";
  wb.created = new Date();
  const primary = ctx.org.settings.branding.primaryColor;
  const seq = new Map(ctx.captures.map((c) => [c.id, c.seq]));
  const photoList = (ids: string[]) => ids.map((id) => seq.get(id)).filter(Boolean).join(", ");

  const info = wb.addWorksheet("Schouw");
  info.columns = [
    { header: "Kenmerk", key: "k", width: 24 },
    { header: "Waarde", key: "v", width: 70 },
  ];
  info.getRow(1).font = { bold: true };
  [
    ["Titel", ctx.inspection.title],
    ["Schouwtype", ctx.template.name],
    ["Project", ctx.project ? `${ctx.project.number} – ${ctx.project.name}` : "Losse schouw"],
    ["Opdrachtgever", ctx.project?.client ?? ""],
    ["Station", ctx.station ? `${ctx.station.code} – ${ctx.station.name}` : ""],
    ["Start", ctx.inspection.startedAt],
    ["Einde", ctx.inspection.endedAt ?? ""],
    ["Adres", ctx.inspection.address ?? ""],
    ["Schouwer", ctx.inspector?.name ?? ""],
    ["Status", ctx.inspection.status],
    ["Gelopen afstand (m)", ctx.track ? Math.round(ctx.track.lengthM) : ""],
  ].forEach(([k, v]) => info.addRow({ k, v }));

  const fws = addSheet(
    wb,
    "Bevindingen",
    [
      { header: "Nr", key: "nr", width: 6 },
      { header: "Titel", key: "title", width: 40 },
      { header: "Omschrijving", key: "description", width: 60 },
      { header: "Prioriteit", key: "priority", width: 12 },
      { header: "Categorie", key: "category", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Aanbeveling", key: "recommendation", width: 50 },
      { header: "Foto's", key: "photos", width: 14 },
      { header: "Lat", key: "lat", width: 12, numFmt: "0.000000" },
      { header: "Lon", key: "lon", width: 12, numFmt: "0.000000" },
      { header: "Bron", key: "source", width: 14 },
      { header: "AI-voorstel", key: "ai", width: 12 },
    ],
    ctx.findings.map((f, i) => ({
      nr: `B${i + 1}`,
      title: f.title,
      description: f.description,
      priority: PRIORITY_LABELS[f.priority],
      category: FINDING_CATEGORY_LABELS[f.category],
      status: FINDING_STATUS_LABELS[f.status],
      recommendation: f.recommendation ?? "",
      photos: photoList(f.captureIds),
      lat: f.lat,
      lon: f.lon,
      source: f.source,
      ai: f.aiAccepted ? "" : "ja",
    })),
    primary,
  );
  ctx.findings.forEach((f, i) => {
    fws.getCell(i + 2, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PRIORITY_COLORS[f.priority].replace("#", "")}` } };
    fws.getCell(i + 2, 4).font = { color: { argb: "FFFFFFFF" }, bold: true };
  });

  const findingNr = new Map(ctx.findings.map((f, i) => [f.id, `B${i + 1}`]));
  addSheet(
    wb,
    "Acties",
    [
      { header: "Nr", key: "nr", width: 6 },
      { header: "Wat", key: "description", width: 60 },
      { header: "Wie", key: "owner", width: 22 },
      { header: "Wanneer", key: "due", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Bevinding", key: "findings", width: 14 },
    ],
    ctx.actions.map((a, i) => ({
      nr: i + 1,
      description: a.description,
      owner: a.owner ?? "",
      due: a.dueDate ?? "",
      status: ACTION_STATUS_LABELS[a.status],
      findings: a.findingIds.map((id) => findingNr.get(id)).filter(Boolean).join(", "),
    })),
    primary,
  );

  addSheet(
    wb,
    "Fotoregister",
    [
      { header: "Nr", key: "nr", width: 6 },
      { header: "Type", key: "type", width: 12 },
      { header: "Tijd", key: "time", width: 20 },
      { header: "RD x", key: "rdx", width: 12, numFmt: "0.00" },
      { header: "RD y", key: "rdy", width: 12, numFmt: "0.00" },
      { header: "Lat", key: "lat", width: 12, numFmt: "0.000000" },
      { header: "Lon", key: "lon", width: 12, numFmt: "0.000000" },
      { header: "Nauwkeurigheid (m)", key: "acc", width: 10 },
      { header: "Locatiebron", key: "locsrc", width: 18 },
      { header: "Richting (°)", key: "heading", width: 10 },
      { header: "Bijschrift", key: "caption", width: 50 },
      { header: "Notitie", key: "note", width: 40 },
      { header: "Tags", key: "tags", width: 24 },
      { header: "In verslag", key: "inReport", width: 10 },
      { header: "Capture-id", key: "id", width: 38 },
    ],
    ctx.captures.map((c) => ({
      nr: c.seq ?? "",
      type: CAPTURE_TYPE_LABELS[c.type],
      time: c.capturedAt,
      rdx: c.rdX,
      rdy: c.rdY,
      lat: c.lat,
      lon: c.lon,
      acc: c.accuracy !== null ? Math.round(c.accuracy) : "",
      locsrc: LOCATION_SOURCE_LABELS[c.locationSource],
      heading: c.heading !== null ? Math.round(c.heading) : "",
      caption: c.analysis?.caption ?? c.textContent ?? "",
      note: c.note ?? "",
      tags: c.tags.join(", "),
      inReport: c.hiddenInReport ? "nee" : "ja",
      id: c.id,
    })),
    primary,
  );

  addSheet(
    wb,
    "Metingen",
    [
      { header: "Tijd", key: "time", width: 20 },
      { header: "Soort", key: "kind", width: 12 },
      { header: "Omschrijving", key: "label", width: 40 },
      { header: "Waarde", key: "value", width: 10 },
      { header: "Eenheid", key: "unit", width: 10 },
      { header: "Foto", key: "photo", width: 8 },
      { header: "Lat", key: "lat", width: 12, numFmt: "0.000000" },
      { header: "Lon", key: "lon", width: 12, numFmt: "0.000000" },
    ],
    ctx.measurements.map((m) => ({ time: m.measuredAt, kind: m.kind, label: m.label, value: m.value, unit: m.unit, photo: m.photoCaptureId ? (seq.get(m.photoCaptureId) ?? "") : "", lat: m.lat, lon: m.lon })),
    primary,
  );

  addSheet(
    wb,
    "Checklist",
    [
      { header: "Vraag", key: "q", width: 60 },
      { header: "Antwoord", key: "a", width: 14 },
      { header: "Toelichting", key: "n", width: 40 },
      { header: "Overgeslagen (reden)", key: "s", width: 30 },
      { header: "Foto's", key: "p", width: 12 },
    ],
    ctx.template.checklist.map((item) => {
      const a = ctx.answers.find((x) => x.itemId === item.id);
      return { q: item.question, a: answerLabel(a?.value ?? null), n: a?.note ?? "", s: a?.skippedReason ?? "", p: photoList(a?.captureIds ?? []) };
    }),
    primary,
  );

  if (ctx.billingEvidence.length) {
    const itemById = new Map(ctx.billingItems.map((b) => [b.id, b]));
    addSheet(
      wb,
      "Afrekenonderbouwing",
      [
        { header: "Post", key: "code", width: 10 },
        { header: "Omschrijving", key: "desc", width: 50 },
        { header: "Eenheid", key: "unit", width: 8 },
        { header: "Hoeveelheid", key: "qty", width: 12, numFmt: "#,##0.###" },
        { header: "Eenheidsprijs", key: "price", width: 14, numFmt: "€ #,##0.00" },
        { header: "Bedrag", key: "amount", width: 14, numFmt: "€ #,##0.00" },
        { header: "Status", key: "status", width: 12 },
        { header: "Foto's", key: "photos", width: 14 },
        { header: "Toelichting", key: "remark", width: 40 },
      ],
      ctx.billingEvidence.map((e) => {
        const item = itemById.get(e.billingItemId);
        return {
          code: item?.code ?? "",
          desc: item?.description ?? "",
          unit: item?.unit ?? "",
          qty: e.quantity,
          price: item?.unitPrice ?? 0,
          amount: (item?.unitPrice ?? 0) * e.quantity,
          status: BILLING_EVIDENCE_STATUS_LABELS[e.status],
          photos: photoList(e.captureIds),
          remark: e.remark ?? "",
        };
      }),
      primary,
    );
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

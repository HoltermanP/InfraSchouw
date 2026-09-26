import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from "docx";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/domain";
import type { Block, Img, PhotoRef, ReportModel, Run } from "./model";

const hex = (c: string) => c.replace("#", "").toUpperCase();

function textRuns(runs: Run[], extra: { size?: number; color?: string } = {}) {
  return runs.flatMap((r) =>
    r.text.split("\n").map(
      (part, i) =>
        new TextRun({
          text: part,
          bold: r.bold,
          italics: r.italic,
          underline: r.underline ? {} : undefined,
          break: i > 0 ? 1 : undefined,
          size: extra.size,
          color: extra.color,
        }),
    ),
  );
}

function image(img: Img, maxWidthPx: number, maxHeightPx = 420) {
  const scale = Math.min(maxWidthPx / img.width, maxHeightPx / img.height, 1);
  return new ImageRun({ type: img.format === "png" ? "png" : "jpg", data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } });
}

function photoCaption(p: PhotoRef): Paragraph[] {
  return [
    new Paragraph({ children: [new TextRun({ text: `Foto ${p.nr ?? "–"}`, bold: true, size: 18 }), new TextRun({ text: p.caption ? ` — ${p.caption}` : "", size: 18 })], spacing: { after: 0 } }),
    new Paragraph({ children: [new TextRun({ text: p.meta, size: 16, color: "6B7280" })], spacing: { after: 160 } }),
  ];
}

function cell(text: string, opts: { header?: boolean; color?: string | null; width?: number; primary: string }) {
  const fill = opts.header ? hex(opts.primary) : opts.color ? hex(opts.color) : undefined;
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.header || Boolean(opts.color), color: opts.header || opts.color ? "FFFFFF" : undefined, size: 17 })] })],
  });
}

function blockToDocx(b: Block, primary: string): (Paragraph | Table)[] {
  switch (b.type) {
    case "paragraph":
      return [new Paragraph({ children: textRuns(b.runs), spacing: { after: 120 } })];
    case "heading":
      return [new Paragraph({ text: b.text, heading: b.level <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })];
    case "list":
      return b.items.map((item) => new Paragraph({ children: textRuns(item), bullet: b.ordered ? undefined : { level: 0 }, numbering: undefined, spacing: { after: 60 } }));
    case "quote":
      return [new Paragraph({ children: textRuns(b.runs.map((r) => ({ ...r, italic: true }))), indent: { left: 400 } })];
    case "photo":
      return [
        ...(b.photo.image ? [new Paragraph({ children: [image(b.photo.image, 480)] })] : [new Paragraph({ children: [new TextRun({ text: "[Afbeelding niet beschikbaar]", italics: true })] })]),
        ...photoCaption(b.photo),
      ];
    case "photoGrid": {
      const rows: TableRow[] = [];
      for (let i = 0; i < b.photos.length; i += 2) {
        rows.push(
          new TableRow({
            children: [b.photos[i], b.photos[i + 1]].map(
              (p) =>
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                  children: p ? [...(p.image ? [new Paragraph({ children: [image(p.image, 290, 220)] })] : []), ...photoCaption(p)] : [new Paragraph("")],
                }),
            ),
          }),
        );
      }
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }), ...(b.caption ? [new Paragraph({ children: [new TextRun({ text: b.caption, italics: true, size: 18 })] })] : [])];
    }
    case "map":
      return [
        ...(b.image ? [new Paragraph({ children: [image(b.image, 620, 420)] })] : [new Paragraph({ children: [new TextRun({ text: "[Kaart niet beschikbaar]", italics: true })] })]),
        new Paragraph({ children: [new TextRun({ text: b.caption, italics: true, size: 18 })], spacing: { after: 200 } }),
      ];
    case "finding":
      return [
        new Paragraph({
          children: [new TextRun({ text: `B${b.nr}. ${b.title}`, bold: true })],
          border: { left: { style: BorderStyle.SINGLE, size: 24, color: hex(PRIORITY_COLORS[b.priority]), space: 6 } },
          spacing: { before: 120, after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Prioriteit ${PRIORITY_LABELS[b.priority]} · ${b.category} · ${b.status}${b.photoNrs.filter(Boolean).length ? ` · foto ${b.photoNrs.filter(Boolean).join(", ")}` : ""}${b.coords ? ` · ${b.coords}` : ""}${b.aiProposal ? " · AI-voorstel" : ""}`,
              size: 16,
              color: "6B7280",
            }),
          ],
          border: { left: { style: BorderStyle.SINGLE, size: 24, color: hex(PRIORITY_COLORS[b.priority]), space: 6 } },
        }),
        ...(b.description ? [new Paragraph({ text: b.description, border: { left: { style: BorderStyle.SINGLE, size: 24, color: hex(PRIORITY_COLORS[b.priority]), space: 6 } } })] : []),
        ...(b.recommendation
          ? [new Paragraph({ children: [new TextRun({ text: "Aanbeveling: ", bold: true }), new TextRun(b.recommendation)], border: { left: { style: BorderStyle.SINGLE, size: 24, color: hex(PRIORITY_COLORS[b.priority]), space: 6 } }, spacing: { after: 160 } })]
          : []),
      ];
    case "table": {
      const widths = b.widths && b.widths.length === b.columns.length ? b.widths : b.columns.map(() => 100 / Math.max(1, b.columns.length));
      return [
        ...(b.caption ? [new Paragraph({ children: [new TextRun({ text: b.caption, italics: true, size: 18 })], spacing: { before: 120 } })] : []),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.columns.map((c, i) => cell(c, { header: true, width: widths[i], primary })) }),
            ...b.rows.map((r, ri) => new TableRow({ children: b.columns.map((_, ci) => cell(r[ci] ?? "", { width: widths[ci], primary, color: b.colorColumn?.index === ci ? b.colorColumn.colors[ri] : null })) })),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 120 } }),
      ];
    }
    case "signatures":
      return b.participants.flatMap((p) => [
        new Paragraph({ children: [new TextRun({ text: p.name, bold: true }), new TextRun({ text: [p.organization, p.role].filter(Boolean).length ? ` — ${[p.organization, p.role].filter(Boolean).join(" · ")}` : "" })] }),
        ...(p.signature ? [new Paragraph({ children: [image(p.signature, 220, 80)] })] : [new Paragraph({ children: [new TextRun({ text: "Niet getekend", italics: true, size: 18 })] })]),
        ...(p.signedAt ? [new Paragraph({ children: [new TextRun({ text: `Getekend: ${p.signedAt}`, size: 16, color: "6B7280" })], spacing: { after: 160 } })] : []),
      ]);
    case "note":
      return [new Paragraph({ children: [new TextRun({ text: b.text, italics: true, color: "6B7280" })] })];
  }
}

export async function renderReportDocx(model: ReportModel): Promise<Buffer> {
  const primary = model.branding.primaryColor;
  const coverRows = model.cover.map(
    (row) =>
      new TableRow({
        children: [
          new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: row.label, color: "6B7280" })] })] }),
          new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: row.value, bold: true })] })] }),
        ],
      }),
  );
  const heading1 = (text: string, opts: Partial<IParagraphOptions> = {}) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, ...opts });
  const body: (Paragraph | Table)[] = [];
  model.sections.forEach((sec, i) => {
    body.push(heading1(`${sec.number}. ${sec.title}`, { pageBreakBefore: i > 0 && ["bijlagen", "station", "overzichtskaart"].includes(sec.key) }));
    sec.blocks.forEach((b) => body.push(...blockToDocx(b, primary)));
  });

  const doc = new Document({
    creator: "InfraSchouw",
    title: model.title,
    description: model.subtitle,
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: hex(primary) }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true }, paragraph: { spacing: { before: 200, after: 80 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true }, paragraph: { spacing: { before: 160, after: 60 } } },
      ],
    },
    features: { updateFields: true },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  ...(model.branding.logo ? [image(model.branding.logo, 120, 30)] : [new TextRun({ text: model.branding.companyName, bold: true, color: hex(primary) })]),
                  new TextRun({ text: `\t${model.title}`, size: 16, color: "6B7280" }),
                ],
                tabStops: [{ type: "right", position: 9000 }],
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: hex(primary), space: 4 } },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: "right", position: 9000 }],
                children: [
                  new TextRun({ text: model.branding.footerText || model.branding.companyName, size: 15, color: "6B7280" }),
                  new TextRun({ children: [`\tVersie ${model.versionNumber ?? "–"} · ${model.statusLabel} · Pagina `, PageNumber.CURRENT, " van ", PageNumber.TOTAL_PAGES], size: 15, color: "6B7280" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ children: [new TextRun({ text: "SCHOUWVERSLAG", bold: true, color: hex(model.branding.accentColor), size: 20 })], spacing: { before: 1200 } }),
          new Paragraph({ children: [new TextRun({ text: model.title, bold: true, size: 48, color: hex(primary) })] }),
          new Paragraph({ children: [new TextRun({ text: model.subtitle, size: 26, color: "374151" })], spacing: { after: 400 } }),
          new Table({ rows: coverRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
          ...(model.aiNotice
            ? [new Paragraph({ children: [new TextRun({ text: "Dit verslag bevat AI-voorstellen die nog niet door een gebruiker zijn geaccepteerd.", italics: true, color: "6D28D9" })], spacing: { before: 300 } })]
            : []),
          ...(model.isDraft ? [new Paragraph({ children: [new TextRun({ text: "CONCEPT", bold: true, size: 36, color: "9CA3AF" })], alignment: AlignmentType.CENTER, spacing: { before: 400 } })] : []),
          new Paragraph({ children: [new PageBreak()] }),
          heading1("Inhoudsopgave"),
          new TableOfContents("Inhoudsopgave", { hyperlink: true, headingStyleRange: "1-1" }),
          new Paragraph({ children: [new TextRun({ text: "Rechtsklik → ‘Veld bijwerken’ als de inhoudsopgave leeg is.", size: 14, color: "9CA3AF" })] }),
          new Paragraph({ children: [new PageBreak()] }),
          ...body,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

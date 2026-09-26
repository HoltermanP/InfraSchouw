import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/domain";
import type { Block, PhotoRef, ReportModel, Run } from "./model";

/** Helvetica (built-in) covers WinAnsi; replace the few characters it lacks. */
function safe(text: string): string {
  return text
    .replace(/↔/g, "t.o.v.")
    .replace(/[→⇒]/g, "->")
    .replace(/[✓✔]/g, "v")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[‑–]/g, "-")
    .replace(/[^\u0000-ɏ–-•…€°²³\n]/g, "");
}

function makeStyles(primary: string, accent: string) {
  return StyleSheet.create({
    page: { paddingTop: 70, paddingBottom: 60, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937", lineHeight: 1.4 },
    header: { position: "absolute", top: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: primary, paddingBottom: 6 },
    headerTitle: { fontSize: 8, color: "#6b7280", maxWidth: 300, textAlign: "right" },
    headerCompany: { fontSize: 10, fontFamily: "Helvetica-Bold", color: primary },
    logo: { height: 22, maxWidth: 120, objectFit: "contain" },
    footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#6b7280", borderTopWidth: 0.5, borderTopColor: "#d1d5db", paddingTop: 5 },
    watermark: { position: "absolute", top: 330, left: 60, fontSize: 90, color: "#e5e7eb", transform: "rotate(-35deg)", fontFamily: "Helvetica-Bold", opacity: 0.55 },
    coverBand: { backgroundColor: primary, marginHorizontal: -44, marginTop: -70, paddingHorizontal: 44, paddingTop: 110, paddingBottom: 40, marginBottom: 30 },
    coverKicker: { color: accent, fontSize: 10, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginBottom: 8 },
    coverTitle: { color: "#ffffff", fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
    coverSubtitle: { color: "#e5e7eb", fontSize: 12, marginTop: 8 },
    coverRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
    coverLabel: { width: 130, color: "#6b7280" },
    coverValue: { flex: 1, fontFamily: "Helvetica-Bold" },
    notice: { marginTop: 18, padding: 8, backgroundColor: "#f5f3ff", borderLeftWidth: 3, borderLeftColor: "#7c3aed", fontSize: 8.5 },
    h1: { fontSize: 15, fontFamily: "Helvetica-Bold", color: primary, marginBottom: 8, marginTop: 4 },
    h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 10, marginBottom: 4 },
    h3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 8, marginBottom: 3 },
    p: { marginBottom: 5, textAlign: "justify" },
    tocRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
    figure: { marginVertical: 6, alignItems: "flex-start" },
    photo: { maxHeight: 300, objectFit: "contain" },
    caption: { fontSize: 8.5, marginTop: 3, color: "#374151" },
    captionMeta: { fontSize: 7.5, color: "#6b7280" },
    grid: { flexDirection: "row", flexWrap: "wrap", marginVertical: 6, marginHorizontal: -4 },
    gridItem: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
    gridPhoto: { width: "100%", height: 170, objectFit: "cover" },
    finding: { flexDirection: "row", marginVertical: 5, borderWidth: 0.5, borderColor: "#e5e7eb" },
    findingBar: { width: 4 },
    findingBody: { flex: 1, padding: 7 },
    findingTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
    findingMeta: { fontSize: 7.5, color: "#6b7280", marginBottom: 3 },
    table: { marginVertical: 6, borderWidth: 0.5, borderColor: "#d1d5db" },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
    th: { backgroundColor: primary, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 4 },
    td: { fontSize: 8, padding: 4 },
    tableCaption: { fontSize: 8.5, fontFamily: "Helvetica-Oblique", color: "#374151", marginTop: 8 },
    note: { fontSize: 8.5, color: "#6b7280", fontFamily: "Helvetica-Oblique", marginVertical: 3 },
    sigGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    sigBox: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
    sigInner: { borderWidth: 0.5, borderColor: "#d1d5db", padding: 6, minHeight: 90 },
    sigImage: { height: 45, objectFit: "contain", marginTop: 4 },
    li: { flexDirection: "row", marginBottom: 2 },
    quote: { borderLeftWidth: 2, borderLeftColor: "#d1d5db", paddingLeft: 8, fontFamily: "Helvetica-Oblique", marginBottom: 5 },
  });
}
type Styles = ReturnType<typeof makeStyles>;

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={{
            fontFamily: r.bold && r.italic ? "Helvetica-BoldOblique" : r.bold ? "Helvetica-Bold" : r.italic ? "Helvetica-Oblique" : "Helvetica",
            textDecoration: r.underline ? "underline" : undefined,
          }}
        >
          {safe(r.text)}
        </Text>
      ))}
    </>
  );
}

function PhotoFigure({ p, s }: { p: PhotoRef; s: Styles }) {
  return (
    <View style={s.figure} wrap={false}>
      {p.image ? <Image src={{ data: p.image.data, format: p.image.format }} style={[s.photo, { width: Math.min(360, (300 * p.image.width) / p.image.height) }]} /> : <Text style={s.note}>[Afbeelding niet beschikbaar]</Text>}
      <Text style={s.caption}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Foto {p.nr ?? "–"}</Text>
        {p.caption ? ` — ${safe(p.caption)}` : ""}
      </Text>
      <Text style={s.captionMeta}>{safe(p.meta)}</Text>
    </View>
  );
}

function TableView({ b, s }: { b: Extract<Block, { type: "table" }>; s: Styles }) {
  const n = b.columns.length || 1;
  const widths = b.widths && b.widths.length === n ? b.widths : Array.from({ length: n }, () => 100 / n);
  return (
    <View>
      {b.caption ? <Text style={s.tableCaption}>{safe(b.caption)}</Text> : null}
      <View style={s.table}>
        <View style={s.tr} fixed>
          {b.columns.map((c, i) => (
            <Text key={i} style={[s.th, { width: `${widths[i]}%` }]}>
              {safe(c)}
            </Text>
          ))}
        </View>
        {b.rows.map((row, ri) => (
          <View key={ri} style={[s.tr, { backgroundColor: ri % 2 ? "#f9fafb" : "#ffffff" }]} wrap={false}>
            {b.columns.map((_, ci) => {
              const color = b.colorColumn && b.colorColumn.index === ci ? b.colorColumn.colors[ri] : null;
              return (
                <Text key={ci} style={[s.td, { width: `${widths[ci]}%` }, color ? { color: "#ffffff", backgroundColor: color, fontFamily: "Helvetica-Bold" } : {}]}>
                  {safe(row[ci] ?? "")}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function BlockView({ b, s }: { b: Block; s: Styles }) {
  switch (b.type) {
    case "paragraph":
      return (
        <Text style={s.p}>
          <Runs runs={b.runs} />
        </Text>
      );
    case "heading":
      return <Text style={b.level <= 2 ? s.h2 : s.h3} minPresenceAhead={60}>{safe(b.text)}</Text>;
    case "list":
      return (
        <View style={{ marginBottom: 5 }}>
          {b.items.map((item, i) => (
            <View key={i} style={s.li}>
              <Text style={{ width: 14 }}>{b.ordered ? `${i + 1}.` : "•"}</Text>
              <Text style={{ flex: 1 }}>
                <Runs runs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <Text style={s.quote}>
          <Runs runs={b.runs} />
        </Text>
      );
    case "photo":
      return <PhotoFigure p={b.photo} s={s} />;
    case "photoGrid":
      return (
        <View>
          <View style={s.grid}>
            {b.photos.map((p) => (
              <View key={p.captureId} style={s.gridItem} wrap={false}>
                {p.image ? <Image src={{ data: p.image.data, format: p.image.format }} style={s.gridPhoto} /> : <Text style={s.note}>[Afbeelding niet beschikbaar]</Text>}
                <Text style={s.caption}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Foto {p.nr ?? "–"}</Text>
                  {p.caption ? ` — ${safe(p.caption)}` : ""}
                </Text>
                <Text style={s.captionMeta}>{safe(p.meta)}</Text>
              </View>
            ))}
          </View>
          {b.caption ? <Text style={s.tableCaption}>{safe(b.caption)}</Text> : null}
        </View>
      );
    case "map":
      return (
        <View wrap={false} style={{ marginVertical: 6 }}>
          {b.image ? <Image src={{ data: b.image.data, format: b.image.format }} style={{ width: "100%", objectFit: "contain" }} /> : <Text style={s.note}>[Kaart niet beschikbaar — geen locaties of geen verbinding met PDOK]</Text>}
          <Text style={s.caption}>{safe(b.caption)}</Text>
        </View>
      );
    case "finding":
      return (
        <View style={s.finding} wrap={false}>
          <View style={[s.findingBar, { backgroundColor: PRIORITY_COLORS[b.priority] }]} />
          <View style={s.findingBody}>
            <Text style={s.findingTitle}>
              B{b.nr}. {safe(b.title)}
            </Text>
            <Text style={s.findingMeta}>
              Prioriteit {PRIORITY_LABELS[b.priority]} · {b.category} · {b.status}
              {b.photoNrs.filter(Boolean).length ? ` · foto ${b.photoNrs.filter(Boolean).join(", ")}` : ""}
              {b.coords ? ` · ${b.coords}` : ""}
              {b.aiProposal ? " · AI-voorstel" : ""}
            </Text>
            {b.description ? <Text style={s.p}>{safe(b.description)}</Text> : null}
            {b.recommendation ? (
              <Text style={{ fontSize: 8.5 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Aanbeveling: </Text>
                {safe(b.recommendation)}
              </Text>
            ) : null}
          </View>
        </View>
      );
    case "table":
      return <TableView b={b} s={s} />;
    case "signatures":
      return (
        <View style={s.sigGrid}>
          {b.participants.map((p, i) => (
            <View key={i} style={s.sigBox} wrap={false}>
              <View style={s.sigInner}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{safe(p.name)}</Text>
                <Text style={s.captionMeta}>{safe([p.organization, p.role].filter(Boolean).join(" · ") || "—")}</Text>
                {p.signature ? <Image src={{ data: p.signature.data, format: p.signature.format }} style={s.sigImage} /> : <Text style={[s.note, { marginTop: 16 }]}>Niet getekend</Text>}
                {p.signedAt ? <Text style={s.captionMeta}>Getekend: {p.signedAt}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      );
    case "note":
      return <Text style={s.note}>{safe(b.text)}</Text>;
  }
}

function ReportDocument({ model, tocPages, onSectionPage }: { model: ReportModel; tocPages: Record<string, number> | null; onSectionPage?: (key: string, page: number) => void }) {
  const s = makeStyles(model.branding.primaryColor, model.branding.accentColor);
  const pageChrome = (
    <>
      <View style={s.header} fixed>
        {model.branding.logo ? <Image src={{ data: model.branding.logo.data, format: model.branding.logo.format }} style={s.logo} /> : <Text style={s.headerCompany}>{safe(model.branding.companyName)}</Text>}
        <Text style={s.headerTitle}>{safe(model.title)}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>{safe(model.branding.footerText || model.branding.companyName)}</Text>
        <Text render={({ pageNumber, totalPages }) => `Versie ${model.versionNumber ?? "–"} · ${model.statusLabel} · Pagina ${pageNumber} van ${totalPages}`} />
      </View>
      {model.isDraft ? (
        <Text style={s.watermark} fixed>
          CONCEPT
        </Text>
      ) : null}
    </>
  );
  return (
    <Document title={safe(model.title)} author={safe(model.branding.companyName)} subject={safe(model.subtitle)} creator="InfraSchouw" language="nl">
      <Page size="A4" style={s.page}>
        {pageChrome}
        <View style={s.coverBand}>
          <Text style={s.coverKicker}>SCHOUWVERSLAG</Text>
          <Text style={s.coverTitle}>{safe(model.title)}</Text>
          <Text style={s.coverSubtitle}>{safe(model.subtitle)}</Text>
        </View>
        {model.cover.map((row) => (
          <View key={row.label} style={s.coverRow}>
            <Text style={s.coverLabel}>{row.label}</Text>
            <Text style={s.coverValue}>{safe(row.value)}</Text>
          </View>
        ))}
        {model.aiNotice ? (
          <Text style={s.notice}>Dit verslag bevat AI-voorstellen die nog niet door een gebruiker zijn geaccepteerd. Controleer deze onderdelen voordat het verslag definitief wordt.</Text>
        ) : null}
        <Text style={[s.captionMeta, { marginTop: 18 }]}>Gegenereerd op {model.generatedAt} met InfraSchouw.</Text>
      </Page>
      <Page size="A4" style={s.page}>
        {pageChrome}
        <Text style={s.h1}>Inhoudsopgave</Text>
        {model.sections.map((sec) => (
          <View key={sec.key} style={s.tocRow}>
            <Text>
              {sec.number}. {safe(sec.title)}
            </Text>
            <Text>{tocPages?.[sec.key] ?? "00"}</Text>
          </View>
        ))}
      </Page>
      {model.sections.map((sec) => (
        // Every chapter starts on a new page (common for engineering reports) and
        // lets us measure the chapter's first page for the table of contents.
        <Page key={sec.key} size="A4" style={s.page} wrap>
          {pageChrome}
          <Text
            fixed
            style={{ position: "absolute", top: 0, left: 0, fontSize: 1, color: "#ffffff" }}
            render={({ pageNumber }) => {
              onSectionPage?.(sec.key, pageNumber);
              return " ";
            }}
          />
          <Text style={s.h1} minPresenceAhead={80}>
            {sec.number}. {safe(sec.title)}
          </Text>
          {sec.blocks.map((b, bi) => (
            <BlockView key={bi} b={b} s={s} />
          ))}
        </Page>
      ))}
    </Document>
  );
}

/** Render the report PDF (two passes so the table of contents has page numbers). */
export async function renderReportPdf(model: ReportModel): Promise<Buffer> {
  const pages: Record<string, number> = {};
  await renderToBuffer(<ReportDocument model={model} tocPages={null} onSectionPage={(k, p) => (pages[k] = Math.min(pages[k] ?? Infinity, p))} />);
  return renderToBuffer(<ReportDocument model={model} tocPages={pages} />);
}

/** Generic document (e.g. billing evidence appendix) using the same styling. */
export async function renderSimplePdf(input: {
  title: string;
  subtitle: string;
  branding: ReportModel["branding"];
  sections: { title: string; blocks: Block[] }[];
}): Promise<Buffer> {
  const s = makeStyles(input.branding.primaryColor, input.branding.accentColor);
  return renderToBuffer(
    <Document title={safe(input.title)} creator="InfraSchouw" language="nl">
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Text style={s.headerCompany}>{safe(input.branding.companyName)}</Text>
          <Text style={s.headerTitle}>{safe(input.title)}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>{safe(input.branding.footerText || input.branding.companyName)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
        <Text style={s.h1}>{safe(input.title)}</Text>
        <Text style={[s.captionMeta, { marginBottom: 10 }]}>{safe(input.subtitle)}</Text>
        {input.sections.map((sec, i) => (
          <View key={i}>
            <Text style={s.h2} minPresenceAhead={80}>
              {safe(sec.title)}
            </Text>
            {sec.blocks.map((b, bi) => (
              <BlockView key={bi} b={b} s={s} />
            ))}
          </View>
        ))}
      </Page>
    </Document>,
  );
}

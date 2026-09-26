import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/domain";
import type { Block, ReportModel, Run } from "@/lib/export/model";

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let el: React.ReactNode = r.text;
        if (r.bold) el = <strong>{el}</strong>;
        if (r.italic) el = <em>{el}</em>;
        if (r.underline) el = <u>{el}</u>;
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function BlockHtml({ b, photoSrc, mapSrc }: { b: Block; photoSrc: (captureId: string) => string; mapSrc: string }) {
  switch (b.type) {
    case "paragraph":
      return (
        <p className="my-2 leading-relaxed">
          <Runs runs={b.runs} />
        </p>
      );
    case "heading":
      return <h3 className="mt-4 mb-1 text-lg font-semibold">{b.text}</h3>;
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L className={`my-2 pl-6 ${b.ordered ? "list-decimal" : "list-disc"}`}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Runs runs={it} />
            </li>
          ))}
        </L>
      );
    }
    case "quote":
      return (
        <blockquote className="my-2 border-l-4 pl-3 italic">
          <Runs runs={b.runs} />
        </blockquote>
      );
    case "photo":
      return (
        <figure className="my-4">
          <img src={photoSrc(b.photo.captureId)} alt={b.photo.caption} className="max-h-[28rem] rounded border object-contain" loading="lazy" />
          <figcaption className="mt-1 text-sm">
            <strong>Foto {b.photo.nr ?? "–"}</strong>
            {b.photo.caption ? ` — ${b.photo.caption}` : ""}
            <span className="block text-xs text-muted-foreground">{b.photo.meta}</span>
          </figcaption>
        </figure>
      );
    case "photoGrid":
      return (
        <div className="my-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {b.photos.map((p) => (
            <figure key={p.captureId}>
              <img src={photoSrc(p.captureId)} alt={p.caption} className="aspect-[4/3] w-full rounded border object-cover" loading="lazy" />
              <figcaption className="mt-1 text-xs">
                <strong>Foto {p.nr ?? "–"}</strong>
                {p.caption ? ` — ${p.caption}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    case "map":
      return (
        <figure className="my-4">
          <img src={mapSrc} alt="Overzichtskaart" className="w-full rounded border" loading="lazy" />
          <figcaption className="mt-1 text-xs text-muted-foreground">{b.caption}</figcaption>
        </figure>
      );
    case "finding":
      return (
        <div className="my-3 flex overflow-hidden rounded border">
          <div className="w-1.5 shrink-0" style={{ background: PRIORITY_COLORS[b.priority] }} />
          <div className="p-3 text-sm">
            <p className="font-semibold">
              B{b.nr}. {b.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Prioriteit {PRIORITY_LABELS[b.priority]} · {b.category} · {b.status}
              {b.photoNrs.filter(Boolean).length ? ` · foto ${b.photoNrs.filter(Boolean).join(", ")}` : ""}
            </p>
            {b.description ? <p className="mt-1">{b.description}</p> : null}
            {b.recommendation ? (
              <p className="mt-1">
                <strong>Aanbeveling:</strong> {b.recommendation}
              </p>
            ) : null}
          </div>
        </div>
      );
    case "table":
      return (
        <div className="my-3 overflow-x-auto">
          {b.caption ? <p className="mb-1 text-sm italic">{b.caption}</p> : null}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {b.columns.map((c, i) => (
                  <th key={i} className="border bg-muted px-2 py-1 text-left">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {b.columns.map((_, ci) => {
                    const color = b.colorColumn?.index === ci ? b.colorColumn.colors[ri] : null;
                    return (
                      <td key={ci} className="border px-2 py-1 align-top" style={color ? { background: color, color: "#fff", fontWeight: 600 } : undefined}>
                        {r[ci]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "signatures":
      return (
        <ul className="my-2 grid gap-2 sm:grid-cols-2">
          {b.participants.map((p, i) => (
            <li key={i} className="rounded border p-2 text-sm">
              <strong>{p.name}</strong>
              <span className="block text-xs text-muted-foreground">{[p.organization, p.role].filter(Boolean).join(" · ")}</span>
              <span className="text-xs">{p.signedAt ? `Getekend op ${p.signedAt}` : "Niet getekend"}</span>
            </li>
          ))}
        </ul>
      );
    case "note":
      return <p className="my-2 text-sm text-muted-foreground italic">{b.text}</p>;
  }
}

/** Read-only HTML rendering of a report model (share links). */
export function ReportHtml({ model, photoSrc, mapSrc, logoSrc }: { model: ReportModel; photoSrc: (captureId: string) => string; mapSrc: string; logoSrc?: string | null }) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-8 rounded-lg p-8 text-white" style={{ background: model.branding.primaryColor }}>
        {logoSrc ? <img src={logoSrc} alt={model.branding.companyName} className="mb-4 max-h-12 rounded bg-white p-1" /> : <p className="mb-2 text-sm font-semibold opacity-80">{model.branding.companyName}</p>}
        <p className="text-xs font-bold tracking-widest" style={{ color: model.branding.accentColor }}>
          SCHOUWVERSLAG
        </p>
        <h1 className="mt-1 text-3xl font-bold">{model.title}</h1>
        <p className="mt-1 opacity-85">{model.subtitle}</p>
      </header>
      <dl className="mb-8 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {model.cover.map((c) => (
          <div key={c.label} className="flex justify-between gap-4 border-b py-1">
            <dt className="text-muted-foreground">{c.label}</dt>
            <dd className="text-right font-medium">{c.value}</dd>
          </div>
        ))}
      </dl>
      <nav className="mb-8 rounded border p-4 text-sm" aria-label="Inhoudsopgave">
        <p className="mb-1 font-semibold">Inhoud</p>
        <ol className="list-decimal pl-5">
          {model.sections.map((s) => (
            <li key={s.key}>
              <a href={`#s-${s.key}`} className="hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {model.sections.map((s) => (
        <section key={s.key} id={`s-${s.key}`} className="mb-10">
          <h2 className="mb-2 border-b pb-1 text-2xl font-bold" style={{ color: model.branding.primaryColor }}>
            {s.number}. {s.title}
          </h2>
          {s.blocks.map((b, i) => (
            <BlockHtml key={i} b={b} photoSrc={photoSrc} mapSrc={mapSrc} />
          ))}
        </section>
      ))}
      <footer className="border-t pt-3 text-xs text-muted-foreground">
        {model.branding.footerText || model.branding.companyName} · Versie {model.versionNumber ?? "–"} · {model.statusLabel}
      </footer>
    </article>
  );
}

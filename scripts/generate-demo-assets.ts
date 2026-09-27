/**
 * Generates the demo media in public/demo (run once; output is committed):
 *   pnpm demo:assets
 * Photos are real, freely licensed images from Wikimedia Commons (downloaded once
 * into node_modules/.cache/demo-photos), cropped to 4:3 and marked "Demo" with their
 * attribution. Nameplates and the station sign are rendered on top of a real photo.
 * Attribution for every photo is written to public/demo/CREDITS.md.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEMO_ASSETS, type DemoAsset } from "./seed/assets";

const OUT = path.join(process.cwd(), "public", "demo");
const CACHE = path.join(process.cwd(), "node_modules", ".cache", "demo-photos");
const UA = "InfraSchouwDemoAssets/1.0 (https://github.com/FrameworkTV/InfraSchouw)";
const W = 1280;
const H = 960;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PhotoInfo = { file: string; author: string; license: string; licenseUrl: string | null; pageUrl: string };

async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok || attempt >= 5) return res;
    await sleep(2000 * (attempt + 1));
  }
}

/** Download (cached) a Commons photo at max 2000 px wide plus its licence metadata. */
async function commonsPhoto(file: string): Promise<{ buf: Buffer; info: PhotoInfo }> {
  mkdirSync(CACHE, { recursive: true });
  const base = path.join(CACHE, file.replace(/[^\w.-]+/g, "_"));
  if (existsSync(`${base}.json`) && existsSync(`${base}.img`)) {
    return { buf: readFileSync(`${base}.img`), info: JSON.parse(readFileSync(`${base}.json`, "utf8")) as PhotoInfo };
  }
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", format: "json", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "2000" })) api.searchParams.set(k, v);
  const json = (await (await fetchRetry(api.toString())).json()) as {
    query: { pages: Record<string, { imageinfo?: { thumburl: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] }> };
  };
  const ii = Object.values(json.query.pages)[0]?.imageinfo?.[0];
  if (!ii) throw new Error(`Commons-bestand niet gevonden: ${file}`);
  const meta = ii.extmetadata;
  const license = meta.LicenseShortName?.value ?? "onbekend";
  if (!/CC0|Public domain|CC BY/i.test(license) || /NC|ND/.test(license)) throw new Error(`Licentie niet toegestaan voor ${file}: ${license}`);
  const author = stripHtml(meta.Artist?.value ?? "onbekend").slice(0, 60);
  const info: PhotoInfo = { file, author, license, licenseUrl: meta.LicenseUrl?.value ?? null, pageUrl: ii.descriptionurl };
  const res = await fetchRetry(ii.thumburl);
  if (!res.ok) throw new Error(`Download mislukt (${res.status}) voor ${file}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${base}.img`, buf);
  writeFileSync(`${base}.json`, JSON.stringify(info, null, 2));
  await sleep(500);
  return { buf, info };
}

/** Crop (optional, in fractions) and cover-resize to 1280×960. */
async function frame(buf: Buffer, a: DemoAsset): Promise<Buffer> {
  let img = sharp(buf).rotate();
  if (a.photo.crop) {
    const m = await sharp(buf).rotate().metadata();
    const w0 = m.autoOrient?.width ?? m.width!;
    const h0 = m.autoOrient?.height ?? m.height!;
    const c = a.photo.crop;
    img = sharp(await img.toBuffer()).extract({
      left: Math.round(c.left * w0),
      top: Math.round(c.top * h0),
      width: Math.round(Math.min(c.width, 1 - c.left) * w0),
      height: Math.round(Math.min(c.height, 1 - c.top) * h0),
    });
  }
  return img.resize(W, H, { fit: "cover", position: sharp.strategy.attention }).toBuffer();
}

/** Brushed-metal plate with engraved rows, slightly rotated with a drop shadow. */
function plateSvg(rows: [string, string][]): string {
  const pw = 760;
  const ph = 150 + rows.length * 58;
  const x = (W - pw) / 2;
  const y = (H - ph) / 2 - 20;
  const text = rows
    .map(([k, v], i) => `<text x="${x + 60}" y="${y + 150 + i * 58}" font-size="32" fill="#2b2f33" font-family="Arial">${esc(k)}</text><text x="${x + 330}" y="${y + 150 + i * 58}" font-size="36" font-weight="700" fill="#1b1e21" font-family="Arial">${esc(v)}</text>`)
    .join("");
  const rivets = [
    [x + 24, y + 24],
    [x + pw - 24, y + 24],
    [x + 24, y + ph - 24],
    [x + pw - 24, y + ph - 24],
  ]
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="11" fill="url(#rivet)" stroke="#555" stroke-width="1.5"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4e7ea"/><stop offset="0.45" stop-color="#bfc5ca"/><stop offset="0.6" stop-color="#d6dade"/><stop offset="1" stop-color="#a9b0b6"/></linearGradient>
<radialGradient id="rivet"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#7d8388"/></radialGradient>
<filter id="brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="10" dy="14" stdDeviation="10" flood-opacity="0.55"/></filter>
</defs>
<g transform="rotate(-2.5 ${W / 2} ${H / 2})">
<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="12" fill="url(#metal)" stroke="#6b7278" stroke-width="3" filter="url(#shadow)"/>
<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="12" fill="#fff" filter="url(#brush)"/>
${rivets}
<text x="${W / 2}" y="${y + 80}" font-size="40" font-weight="700" text-anchor="middle" fill="#1b1e21" font-family="Arial" letter-spacing="4">TYPEPLAAT</text>
<line x1="${x + 50}" y1="${y + 102}" x2="${x + pw - 50}" y2="${y + 102}" stroke="#4a5055" stroke-width="2"/>
${text}
</g></svg>`;
}

/** Enamel station-number sign with a high-voltage warning triangle. */
function signSvg(code: string, lines: string[]): string {
  const sw = 700;
  const sh = 330;
  const x = (W - sw) / 2;
  const y = 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="6" dy="10" stdDeviation="8" flood-opacity="0.5"/></filter>
<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>
<g transform="rotate(1.5 ${W / 2} ${H / 2})">
<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="18" fill="#fbfbf7" stroke="#1d1d1d" stroke-width="8" filter="url(#shadow)"/>
<text x="${W / 2}" y="${y + 125}" font-size="84" font-weight="700" text-anchor="middle" font-family="Arial" fill="#111">${esc(code)}</text>
${lines.map((l, i) => `<text x="${W / 2}" y="${y + 200 + i * 56}" font-size="44" text-anchor="middle" font-family="Arial" fill="#222">${esc(l)}</text>`).join("")}
<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="18" fill="url(#gloss)"/>
<g filter="url(#shadow)"><polygon points="${W / 2 - 110},${y + sh + 230} ${W / 2 + 110},${y + sh + 230} ${W / 2},${y + sh + 40}" fill="#f7c600" stroke="#111" stroke-width="10" stroke-linejoin="round"/></g>
<path d="M${W / 2 + 12} ${y + sh + 95} L${W / 2 - 22} ${y + sh + 160} L${W / 2 + 4} ${y + sh + 160} L${W / 2 - 14} ${y + sh + 215} L${W / 2 + 30} ${y + sh + 142} L${W / 2 + 4} ${y + sh + 142} Z" fill="#111"/>
</g></svg>`;
}

/** Bottom strip: "Demo" badge + label on the left, attribution on the right. */
function captionSvg(a: DemoAsset, info: PhotoInfo): string {
  const credit = `Foto: ${info.author} · ${info.license} · Wikimedia Commons${a.plate || a.sign ? " (bewerkt)" : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient></defs>
<rect x="0" y="${H - 110}" width="${W}" height="110" fill="url(#fade)"/>
<rect x="24" y="${H - 64}" width="78" height="36" rx="6" fill="#facc15"/>
<text x="63" y="${H - 38}" font-size="22" font-weight="700" text-anchor="middle" fill="#111" font-family="Arial">DEMO</text>
<text x="116" y="${H - 38}" font-size="26" font-weight="700" fill="#fff" font-family="Arial">${esc(a.label)}</text>
<text x="${W - 20}" y="${H - 12}" font-size="15" text-anchor="end" fill="#e5e7eb" font-family="Arial">${esc(credit)}</text>
</svg>`;
}

async function renderAsset(a: DemoAsset): Promise<PhotoInfo> {
  const { buf, info } = await commonsPhoto(a.photo.file);
  let base = await frame(buf, a);
  if (a.plate || a.sign) {
    // Close-up: blur and darken the real background so the rendered plate reads as the subject.
    base = await sharp(base).blur(a.plate ? 9 : 4).modulate({ brightness: 0.8 }).toBuffer();
    base = await sharp(base)
      .composite([{ input: Buffer.from(a.plate ? plateSvg(a.plate) : signSvg(a.sign!.code, a.sign!.lines)) }])
      .toBuffer();
  }
  const out = sharp(base).composite([{ input: Buffer.from(captionSvg(a, info)) }]);
  const final = await out.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  writeFileSync(path.join(OUT, `${a.key}.jpg`), final);
  await sharp(final).resize(480, 360).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(OUT, "thumbs", `${a.key}.jpg`));
  return info;
}

function creditsMarkdown(rows: { a: DemoAsset; info: PhotoInfo }[]): string {
  const lines = rows.map(
    ({ a, info }) =>
      `| \`${a.key}.jpg\` | [${info.file.replace(/\|/g, "\\|")}](${info.pageUrl}) | ${info.author.replace(/\|/g, "\\|")} | ${info.licenseUrl ? `[${info.license}](${info.licenseUrl})` : info.license} |${a.plate || a.sign ? " typeplaat/bord toegevoegd, vervaagd" : " bijgesneden"} |`,
  );
  return [
    "# Bronvermelding demofoto's",
    "",
    "De demofoto's in deze map zijn vrij gelicenseerde foto's van Wikimedia Commons, bijgesneden naar 4:3 en voorzien van een DEMO-label en bronvermelding.",
    "Typeplaten en het stationsnummerbord zijn gegenereerd en over een vervaagde foto geplaatst, zodat de tekst overeenkomt met de demodata.",
    "Gegenereerd door `pnpm demo:assets`; niet handmatig bewerken.",
    "",
    "| Bestand | Bron | Maker | Licentie | Bewerking |",
    "| --- | --- | --- | --- | --- |",
    ...lines,
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(path.join(OUT, "thumbs"), { recursive: true });
  const credits: { a: DemoAsset; info: PhotoInfo }[] = [];
  for (const a of DEMO_ASSETS) credits.push({ a, info: await renderAsset(a) });
  writeFileSync(path.join(OUT, "CREDITS.md"), creditsMarkdown(credits));
  // Signatures
  const sigs = [
    "M20 80 C60 10 90 140 130 60 S200 20 230 90 S300 40 330 70",
    "M20 60 C50 120 80 10 120 70 S170 120 210 40 S290 90 340 50",
    "M30 90 Q80 20 120 80 T210 70 T300 60",
  ];
  sigs.forEach((d, i) => {
    writeFileSync(
      path.join(OUT, `signature-${i + 1}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140"><path d="${d}" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/></svg>`,
    );
  });
  for (let i = 1; i <= 3; i++) {
    await sharp(path.join(OUT, `signature-${i}.svg`)).flatten({ background: "#ffffff" }).png().toFile(path.join(OUT, `signature-${i}.png`));
  }
  // Short WAV placeholders for the recorded speech (tone, 6 s).
  const wav = (seconds: number, freq: number) => {
    const rate = 16000;
    const n = rate * seconds;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 3000 * (i % rate < rate * 0.6 ? 1 : 0.2)), 44 + i * 2);
    return buf;
  };
  writeFileSync(path.join(OUT, "spraak-trace.wav"), wav(6, 330));
  writeFileSync(path.join(OUT, "spraak-station.wav"), wav(6, 392));
  writeFileSync(path.join(OUT, "spraak-calamiteit.wav"), wav(6, 262));
  // Demo video (slideshow) with ffmpeg, if available.
  const ffmpeg = (await import("ffmpeg-static")).default as unknown as string | null;
  const video = path.join(OUT, "video-trace.mp4");
  if (ffmpeg && existsSync(ffmpeg)) {
    execFileSync(ffmpeg, [
      "-y", "-loglevel", "error",
      "-loop", "1", "-t", "4", "-i", path.join(OUT, "trace-05-boorlocatie.jpg"),
      "-loop", "1", "-t", "4", "-i", path.join(OUT, "trace-06-sloot.jpg"),
      "-filter_complex", "[0:v]scale=640:480,setsar=1[a];[1:v]scale=640:480,setsar=1[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]",
      "-map", "[v]", "-r", "15", "-movflags", "+faststart", video,
    ]);
  }
  console.log(`${DEMO_ASSETS.length} demofoto's (zie CREDITS.md), handtekeningen, audio en video gegenereerd in public/demo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

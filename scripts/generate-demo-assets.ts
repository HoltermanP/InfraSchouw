/**
 * Generates the rights-free demo media in public/demo (run once; output is committed):
 *   pnpm demo:assets
 * Images are SVG illustrations rendered with sharp, each clearly labelled "Demo –".
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEMO_ASSETS, type DemoAsset, type Scene } from "./seed/assets";

const OUT = path.join(process.cwd(), "public", "demo");
const W = 1280;
const H = 960;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sky(color = "#9fc9ee") {
  return `<rect width="${W}" height="${H}" fill="${color}"/><circle cx="1080" cy="140" r="70" fill="#fff6c9" opacity="0.8"/>`;
}
function ground(y: number, color: string) {
  return `<rect y="${y}" width="${W}" height="${H - y}" fill="${color}"/>`;
}
function klinkers(y: number, h: number) {
  let s = `<rect y="${y}" width="${W}" height="${h}" fill="#b86b4b"/>`;
  for (let r = 0; r < h / 24; r++) for (let c = 0; c < W / 60 + 1; c++) s += `<rect x="${c * 60 + (r % 2 ? 30 : 0)}" y="${y + r * 24}" width="58" height="22" fill="#c47a58" stroke="#8f4d33" stroke-width="2"/>`;
  return s;
}
function tree(x: number, y: number, scale = 1) {
  return `<g transform="translate(${x},${y}) scale(${scale})"><rect x="-14" y="0" width="28" height="170" fill="#6b4226"/><circle cx="0" cy="-40" r="110" fill="#3f8f3a"/><circle cx="-70" cy="10" r="70" fill="#4ea346"/><circle cx="70" cy="0" r="80" fill="#367f32"/></g>`;
}
function house(x: number, y: number, w: number, h: number, color: string) {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="#5a3b2e" stroke-width="3"/><polygon points="${x - 20},${y} ${x + w / 2},${y - 120} ${x + w + 20},${y}" fill="#7a3b2e"/>${[0, 1, 2]
    .map((i) => `<rect x="${x + 30 + i * (w - 60) / 3}" y="${y + 50}" width="${(w - 120) / 3}" height="90" fill="#cfe6f7" stroke="#fff" stroke-width="6"/>`)
    .join("")}<rect x="${x + w / 2 - 35}" y="${y + h - 150}" width="70" height="150" fill="#553322"/></g>`;
}
function station(x: number, y: number) {
  return `<g><rect x="${x}" y="${y}" width="420" height="300" fill="#a8adb3" stroke="#6b7076" stroke-width="4"/><rect x="${x}" y="${y - 25}" width="420" height="30" fill="#7c8288"/>${[0, 1, 2]
    .map((i) => `<rect x="${x + 25 + i * 132}" y="${y + 40}" width="112" height="240" fill="#8c9197" stroke="#555" stroke-width="3"/><circle cx="${x + 120 + i * 132}" cy="${y + 160}" r="6" fill="#333"/>`)
    .join("")}<polygon points="${x + 190},${y + 70} ${x + 230},${y + 70} ${x + 210},${y + 30}" fill="#facc15" stroke="#111" stroke-width="3"/></g>`;
}

function sceneSvg(scene: Scene, a: DemoAsset): string {
  switch (scene) {
    case "street":
      return `${sky()}${ground(560, "#6aa84f")}<rect y="600" width="${W}" height="180" fill="#555"/><rect y="682" width="${W}" height="10" fill="#eee" stroke-dasharray="60 40"/>${klinkers(780, 180)}${tree(180, 420, 0.8)}${house(760, 330, 380, 250, "#d9b38c")}`;
    case "tree":
      return `${sky()}${ground(600, "#6aa84f")}${klinkers(760, 200)}${tree(380, 420, 1.3)}${tree(900, 440, 1.1)}<line x1="0" y1="720" x2="${W}" y2="720" stroke="#e11d48" stroke-width="10" stroke-dasharray="30 20"/><text x="60" y="705" font-size="30" fill="#e11d48" font-family="Arial" font-weight="700">tracé (indicatief)</text>`;
    case "crossing":
      return `${sky()}${ground(520, "#6aa84f")}<rect y="560" width="${W}" height="200" fill="#4b4b4b"/><rect x="520" y="400" width="240" height="560" fill="#4b4b4b"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${540 + i * 44}" y="780" width="30" height="120" fill="#f5f5f5"/>`).join("")}<rect x="1000" y="380" width="14" height="200" fill="#333"/><circle cx="1007" cy="370" r="30" fill="#ef4444"/>`;
    case "boring":
      return `${sky()}${ground(500, "#7cb342")}<path d="M0 640 Q640 560 1280 660 L1280 760 Q640 700 0 760 Z" fill="#4a90c2"/><path d="M120 520 Q640 900 1160 520" fill="none" stroke="#f59e0b" stroke-width="10" stroke-dasharray="24 16"/><rect x="80" y="450" width="120" height="70" fill="#f59e0b"/><rect x="1080" y="450" width="120" height="70" fill="#f59e0b"/><text x="360" y="880" font-size="34" fill="#fff" font-family="Arial">gestuurde boring (boorlijn indicatief)</text>`;
    case "pavement":
      return `${klinkers(0, H)}<path d="M300 380 Q640 300 960 420 Q700 520 380 470 Z" fill="#8f4d33" opacity="0.5"/><rect x="560" y="120" width="160" height="320" fill="#ddd" stroke="#999" stroke-width="4" transform="rotate(8 640 280)"/><text x="580" y="290" font-size="30" font-family="Arial" transform="rotate(8 640 280)">duimstok</text>`;
    case "trench":
      return `${sky("#b8d4ea")}${ground(360, "#7a5c3a")}<rect x="200" y="420" width="880" height="420" fill="#5a4128"/><rect x="200" y="760" width="880" height="80" fill="#8b6b45"/><path d="M200 720 L1080 700" stroke="#111" stroke-width="22"/><path d="M200 660 L1080 650" stroke="#e11d48" stroke-width="16"/><path d="M200 620 L1080 630" stroke="#facc15" stroke-width="14"/><rect x="1000" y="420" width="40" height="420" fill="#fff" stroke="#111" stroke-width="3"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="1000" y1="${440 + i * 50}" x2="1022" y2="${440 + i * 50}" stroke="#111" stroke-width="3"/>`).join("")}`;
    case "facade":
      return `${sky()}${house(170, 260, 940, 560, "#c9a27e")}${klinkers(820, 140)}${a.label.includes("scheur") ? `<path d="M520 330 L540 420 L515 500 L550 600 L530 700" stroke="#222" stroke-width="7" fill="none"/>` : ""}`;
    case "station-ext":
      return `${sky()}${ground(620, "#6aa84f")}${klinkers(760, 200)}${station(430, 360)}${tree(190, 440, 0.9)}`;
    case "station-door":
      return `${sky("#c7d9e8")}<rect x="120" y="120" width="1040" height="720" fill="#a8adb3" stroke="#6b7076" stroke-width="6"/>${[0, 1, 2].map((i) => `<rect x="${170 + i * 330}" y="190" width="290" height="610" fill="#8c9197" stroke="#555" stroke-width="5"/><rect x="${290 + i * 330}" y="480" width="50" height="16" fill="#333"/>`).join("")}<polygon points="600,260 680,260 640,190" fill="#facc15" stroke="#111" stroke-width="4"/>`;
    case "station-sign":
      return `<rect width="${W}" height="${H}" fill="#9aa0a6"/><rect x="240" y="260" width="800" height="360" rx="16" fill="#fff" stroke="#111" stroke-width="8"/><text x="640" y="400" font-size="92" font-weight="700" text-anchor="middle" font-family="Arial">ZWL-STH-4012</text><text x="640" y="490" font-size="44" text-anchor="middle" font-family="Arial">Enexis Netbeheer · 10 kV</text><polygon points="560,740 720,740 640,620" fill="#facc15" stroke="#111" stroke-width="8"/><text x="640" y="720" font-size="80" text-anchor="middle" font-family="Arial" font-weight="700">!</text>`;
    case "station-int":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect y="760" width="${W}" height="200" fill="#9ca3af"/><rect x="120" y="260" width="520" height="500" fill="#d1d5db" stroke="#374151" stroke-width="5"/><rect x="760" y="360" width="360" height="400" fill="#4b5563"/>${[0, 1, 2, 3].map((i) => `<rect x="${140 + i * 125}" y="290" width="110" height="440" fill="#e5e7eb" stroke="#374151" stroke-width="3"/>`).join("")}`;
    case "rmu":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect x="140" y="140" width="1000" height="700" fill="#d1d5db" stroke="#374151" stroke-width="6"/>${[0, 1, 2, 3].map((i) => `<g><rect x="${170 + i * 240}" y="180" width="220" height="620" fill="#f3f4f6" stroke="#374151" stroke-width="4"/><circle cx="${280 + i * 240}" cy="300" r="40" fill="#fff" stroke="#111" stroke-width="4"/><line x1="${280 + i * 240}" y1="300" x2="${300 + i * 240}" y2="275" stroke="#dc2626" stroke-width="6"/><rect x="${230 + i * 240}" y="420" width="100" height="160" fill="#9ca3af"/><text x="${280 + i * 240}" y="700" font-size="34" text-anchor="middle" font-family="Arial">${["K1", "K2", "K3", "T1"][i]}</text></g>`).join("")}<text x="640" y="170" font-size="34" text-anchor="middle" font-family="Arial" font-weight="700">Eaton Xiria</text>`;
    case "rmu-field":
      return `<rect width="${W}" height="${H}" fill="#f3f4f6"/><rect x="360" y="80" width="560" height="800" fill="#fff" stroke="#374151" stroke-width="6"/><circle cx="640" cy="260" r="90" fill="#fff" stroke="#111" stroke-width="6"/><line x1="640" y1="260" x2="700" y2="200" stroke="#16a34a" stroke-width="10"/><rect x="480" y="440" width="320" height="240" fill="#9ca3af"/><rect x="420" y="720" width="440" height="100" fill="#fef3c7" stroke="#111" stroke-width="3"/><text x="640" y="785" font-size="40" text-anchor="middle" font-family="Arial" font-weight="700">${esc(a.label.replace("Demo – ", "").split(" ").slice(0, 2).join(" "))}</text>`;
    case "nameplate": {
      const rows = (a.plate ?? []).map(([k, v], i) => `<text x="300" y="${330 + i * 64}" font-size="40" font-family="Arial">${esc(k)}</text><text x="640" y="${330 + i * 64}" font-size="44" font-family="Arial" font-weight="700">${esc(v)}</text>`).join("");
      return `<rect width="${W}" height="${H}" fill="#6b7280"/><rect x="220" y="170" width="840" height="${120 + (a.plate?.length ?? 0) * 64}" rx="14" fill="#d8dde3" stroke="#374151" stroke-width="8"/>${[0, 1, 2, 3].map((i) => `<circle cx="${i % 2 ? 1030 : 250}" cy="${i < 2 ? 200 : 140 + 120 + (a.plate?.length ?? 0) * 64}" r="10" fill="#374151"/>`).join("")}<text x="640" y="250" font-size="46" text-anchor="middle" font-family="Arial" font-weight="700">TYPEPLAAT</text>${rows}`;
    }
    case "trafo":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect y="800" width="${W}" height="160" fill="#9ca3af"/><rect x="300" y="300" width="680" height="500" fill="#7f8c8d" stroke="#2c3e50" stroke-width="6"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${320 + i * 82}" y="330" width="40" height="440" fill="#95a5a6"/>`).join("")}${[0, 1, 2].map((i) => `<rect x="${440 + i * 140}" y="200" width="40" height="110" fill="#bdc3c7" stroke="#2c3e50" stroke-width="3"/>`).join("")}`;
    case "lv-board":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect x="160" y="120" width="960" height="720" fill="#f9fafb" stroke="#374151" stroke-width="6"/>${Array.from({ length: 8 }, (_, i) => `<g><rect x="${200 + i * 112}" y="260" width="90" height="420" fill="#1f2937"/><rect x="${215 + i * 112}" y="300" width="60" height="120" fill="#fbbf24"/><text x="${245 + i * 112}" y="720" font-size="32" text-anchor="middle" font-family="Arial">G${i + 1}</text></g>`).join("")}<rect x="200" y="160" width="880" height="60" fill="#111827"/>`;
    case "cable-cellar":
      return `<rect width="${W}" height="${H}" fill="#57534e"/><rect x="0" y="600" width="${W}" height="360" fill="#44403c"/>${[0, 1, 2, 3].map((i) => `<circle cx="${300 + i * 230}" cy="420" r="70" fill="#1c1917" stroke="#a8a29e" stroke-width="8"/><circle cx="${300 + i * 230}" cy="420" r="38" fill="${i === 3 ? "#57534e" : "#111"}"/>`).join("")}<rect x="200" y="530" width="880" height="30" fill="#f59e0b" opacity="0.7"/>`;
    case "earthing":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect x="160" y="420" width="960" height="60" fill="#b45309"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${260 + i * 150} 480 L${260 + i * 150} 800" stroke="#16a34a" stroke-width="16"/><path d="M${260 + i * 150} 480 L${260 + i * 150} 800" stroke="#facc15" stroke-width="16" stroke-dasharray="20 20"/>`).join("")}`;
    case "rtu":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><rect x="380" y="160" width="520" height="640" rx="10" fill="#f3f4f6" stroke="#374151" stroke-width="6"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="${460 + i * 90}" cy="260" r="16" fill="${["#16a34a", "#16a34a", "#f59e0b", "#16a34a", "#9ca3af"][i]}"/>`).join("")}<rect x="440" y="340" width="400" height="220" fill="#111827"/><text x="640" y="470" font-size="36" fill="#22c55e" text-anchor="middle" font-family="Courier New">RTU ONLINE</text>`;
    case "safety":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/><polygon points="360,620 560,620 460,420" fill="#facc15" stroke="#111" stroke-width="10"/><text x="460" y="590" font-size="120" text-anchor="middle" font-family="Arial" font-weight="700">!</text><rect x="760" y="360" width="140" height="380" rx="60" fill="#dc2626"/><rect x="795" y="300" width="70" height="70" fill="#111"/><rect x="200" y="160" width="360" height="200" fill="#fff" stroke="#111" stroke-width="4"/><text x="380" y="270" font-size="30" text-anchor="middle" font-family="Arial">SCHEMA MS/LS</text>`;
    case "damage":
      return `${ground(0, "#6b4f2d")}<path d="M0 520 L560 500 L600 470 L640 540 L1280 520" stroke="#111" stroke-width="40" fill="none"/><path d="M590 460 L630 420 L660 470" stroke="#f97316" stroke-width="10" fill="none"/><circle cx="620" cy="500" r="90" fill="none" stroke="#dc2626" stroke-width="12"/>`;
    case "barrier":
      return `${sky()}${ground(560, "#6b7280")}${[0, 1, 2, 3].map((i) => `<g><rect x="${120 + i * 280}" y="560" width="240" height="40" fill="#dc2626"/><rect x="${120 + i * 280}" y="560" width="60" height="40" fill="#fff"/><rect x="${240 + i * 280}" y="560" width="60" height="40" fill="#fff"/><rect x="${130 + i * 280}" y="600" width="12" height="160" fill="#444"/><rect x="${338 + i * 280}" y="600" width="12" height="160" fill="#444"/></g>`).join("")}<polygon points="1080,760 1180,760 1130,640" fill="#f97316"/>`;
    case "excavator":
      return `${sky()}${ground(620, "#7a5c3a")}<rect x="300" y="480" width="360" height="160" fill="#f59e0b"/><rect x="300" y="640" width="400" height="60" rx="30" fill="#374151"/><rect x="420" y="380" width="160" height="110" fill="#fbbf24" stroke="#111" stroke-width="4"/><path d="M640 520 L900 380 L1040 560" stroke="#f59e0b" stroke-width="40" fill="none"/><path d="M1000 540 L1100 600 L1040 660 Z" fill="#374151"/>`;
    case "terminations":
      return `<rect width="${W}" height="${H}" fill="#e5e7eb"/>${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<g><rect x="${240 + c * 300}" y="${160 + r * 240}" width="120" height="180" rx="30" fill="#111827"/><rect x="${260 + c * 300}" y="${320 + r * 240}" width="80" height="80" fill="#374151"/><text x="${300 + c * 300}" y="${270 + r * 240}" font-size="28" fill="#fff" text-anchor="middle" font-family="Arial">${["L1", "L2", "L3"][c]}</text></g>`).join("")).join("")}`;
    case "sketch":
      return `<rect width="${W}" height="${H}" fill="#fff"/>`;
  }
}

function svgFor(a: DemoAsset): string {
  const label = esc(a.label);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sceneSvg(a.scene, a)}<rect x="0" y="${H - 86}" width="${W}" height="86" fill="#0f172a" opacity="0.82"/><text x="30" y="${H - 32}" font-size="38" fill="#fff" font-family="Arial" font-weight="700">${label}</text><text x="${W - 30}" y="${H - 32}" font-size="24" fill="#facc15" font-family="Arial" text-anchor="end">InfraSchouw demodata</text></svg>`;
}

async function main() {
  mkdirSync(path.join(OUT, "thumbs"), { recursive: true });
  for (const a of DEMO_ASSETS) {
    const svg = Buffer.from(svgFor(a));
    await sharp(svg).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(OUT, `${a.key}.jpg`));
    await sharp(svg).resize(480, 360).jpeg({ quality: 70 }).toFile(path.join(OUT, "thumbs", `${a.key}.jpg`));
  }
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
  console.log(`${DEMO_ASSETS.length} demo-afbeeldingen, handtekeningen, audio en video gegenereerd in public/demo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

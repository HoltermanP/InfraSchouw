import type { Priority } from "../domain";

export type VoiceCommand =
  | { type: "photo" }
  | { type: "start-video" }
  | { type: "stop-video" }
  | { type: "start-audio" }
  | { type: "stop-audio" }
  | { type: "note"; text: string }
  | { type: "finding"; priority: Priority; text: string }
  | { type: "measurement"; kind: string; value: number; unit: string; label: string }
  | { type: "next-shot" }
  | { type: "previous-shot" }
  | { type: "scan" }
  | { type: "finish" }
  | { type: "help" }
  | { type: "stop-handsfree" }
  | { type: "unknown"; text: string };

export const VOICE_HELP: { say: string; does: string }[] = [
  { say: "foto", does: "Maakt een foto" },
  { say: "start video / stop video", does: "Start of stopt een video-opname" },
  { say: "start opname / stop opname", does: "Start of stopt een spraakopname" },
  { say: "notitie … (tekst)", does: "Legt een tekstnotitie vast" },
  { say: "bevinding hoog|midden|laag … (tekst)", does: "Legt een bevinding vast, gekoppeld aan de laatste foto" },
  { say: "meting diepte 72 centimeter", does: "Legt een meting vast" },
  { say: "volgende shot / vorige shot", does: "Bladert door de shotlist" },
  { say: "scan", does: "Opent de QR/barcodescanner" },
  { say: "afronden", does: "Telefoon: opent het afrondscherm. Bril: rondt direct af, of toont eerst de open verplichte punten" },
  { say: "reden … (tekst)", does: "Na “afronden”: slaat de open punten over met deze reden en rondt af (bril)" },
  { say: "help", does: "Toont deze lijst" },
  { say: "stop handsfree", does: "Zet de spraakbediening uit" },
];

const NUMBER_WORDS: Record<string, number> = {
  nul: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, twintig: 20, dertig: 30, veertig: 40, vijftig: 50,
  zestig: 60, zeventig: 70, tachtig: 80, negentig: 90, honderd: 100,
};

const UNITS: [RegExp, string][] = [
  [/^(centimeter|centimeters|cm)$/, "cm"],
  [/^(millimeter|millimeters|mm)$/, "mm"],
  [/^(meter|meters|m)$/, "m"],
  [/^(vierkante ?meter|m2|m²)$/, "m2"],
  [/^(stuks|stuk|st)$/, "st"],
  [/^(kva|kilovoltampère|kilovolt-ampère)$/, "kVA"],
  [/^(ampère|ampere|a)$/, "A"],
];

const MEASUREMENT_KINDS = ["diepte", "lengte", "breedte", "hoogte", "aantal"];

function normalize(input: string): string {
  return input
    .toLowerCase()
    // Keep decimal separators between digits ("12,5"), drop other punctuation.
    .replace(/(?<!\d)[.,]|[.,](?!\d)|[!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(token: string): number | null {
  const t = token.replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return NUMBER_WORDS[t] ?? null;
}

/** Parse a recognised Dutch utterance into a command. */
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = normalize(raw);
  if (!text) return { type: "unknown", text: raw };
  if (/^(maak (een )?)?foto( maken)?$|^klik$/.test(text)) return { type: "photo" };
  if (/^(start|begin) (de )?video$|^video (starten|start)$|^neem video op$/.test(text)) return { type: "start-video" };
  if (/^stop (de )?video$|^video stoppen$/.test(text)) return { type: "stop-video" };
  if (/^(start|begin) (de )?(opname|spraakopname|spraak)$|^opname starten$/.test(text)) return { type: "start-audio" };
  if (/^stop (de )?(opname|spraakopname|spraak)$|^opname stoppen$/.test(text)) return { type: "stop-audio" };
  if (/^volgende (shot|foto)$/.test(text)) return { type: "next-shot" };
  if (/^vorige (shot|foto)$/.test(text)) return { type: "previous-shot" };
  if (/^(scan|scannen|qr ?code|barcode)$/.test(text)) return { type: "scan" };
  if (/^(afronden|schouw afronden)$/.test(text)) return { type: "finish" };
  if (/^(help|hulp|commando's|commandos)$/.test(text)) return { type: "help" };
  if (/^(stop handsfree|handsfree (uit|stop)|spraakbediening uit)$/.test(text)) return { type: "stop-handsfree" };

  const note = /^notitie (.+)$/.exec(text);
  if (note) return { type: "note", text: raw.trim().replace(/^notitie[\s:,]*/i, "") };

  const finding = /^bevinding(?: (hoog|midden|middel|laag))?(?: (.+))?$/.exec(text);
  if (finding) {
    const p = finding[1] === "middel" ? "midden" : ((finding[1] as Priority | undefined) ?? "midden");
    const body = raw.trim().replace(/^bevinding\s*(hoog|midden|middel|laag)?[\s:,]*/i, "");
    return { type: "finding", priority: p, text: body };
  }

  const meas = /^meting (\S+)(?: (.+))?$/.exec(text);
  if (meas) {
    const tokens = text.split(" ").slice(1);
    let kind = "overig";
    if (MEASUREMENT_KINDS.includes(tokens[0]!)) kind = tokens.shift()!;
    let value: number | null = null;
    let unit = kind === "aantal" ? "st" : "cm";
    for (let i = 0; i < tokens.length; i++) {
      const n = parseNumber(tokens[i]!);
      if (n !== null && value === null) {
        value = n;
        const next = tokens[i + 1];
        const u = next ? UNITS.find(([re]) => re.test(next)) : undefined;
        if (u) unit = u[1];
        break;
      }
    }
    if (value !== null) {
      const label = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
      return { type: "measurement", kind, value, unit, label };
    }
  }
  return { type: "unknown", text: raw };
}

export type GlassesHomeCommand =
  | { type: "open"; index: number }
  | { type: "new"; templateId: string }
  | { type: "help" }
  | { type: "unknown"; text: string };

const ORDINALS: Record<string, number> = { een: 1, één: 1, eerste: 1, twee: 2, tweede: 2, drie: 3, derde: 3, vier: 4, vierde: 4, vijf: 5, vijfde: 5 };

/** Pick the template whose name best matches the spoken words ("nieuwe schouw tracé"). */
export function matchTemplateByVoice<T extends { id: string; name: string }>(spoken: string, templates: T[]): T | null {
  const words = normalize(spoken)
    .split(" ")
    .filter((w) => w.length > 2 && !["nieuwe", "schouw", "start", "starten", "een"].includes(w));
  if (words.length === 0) return null;
  let best: { t: T; score: number } | null = null;
  for (const t of templates) {
    const name = normalize(t.name).normalize("NFD").replace(/[̀-ͯ]/g, "");
    const score = words.reduce((n, w) => n + (name.includes(w.normalize("NFD").replace(/[̀-ͯ]/g, "")) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}

/** Commands on the glasses start screen. */
export function parseGlassesHomeCommand<T extends { id: string; name: string }>(raw: string, templates: T[]): GlassesHomeCommand {
  const text = normalize(raw);
  if (/^(help|hulp)$/.test(text)) return { type: "help" };
  const open = /^(?:open )?schouw (\S+)$/.exec(text);
  if (open) {
    const n = parseNumber(open[1]!) ?? ORDINALS[open[1]!] ?? null;
    if (n) return { type: "open", index: n - 1 };
  }
  if (/^(nieuwe|start) schouw/.test(text)) {
    const t = matchTemplateByVoice(text, templates);
    if (t) return { type: "new", templateId: t.id };
  }
  return { type: "unknown", text: raw };
}

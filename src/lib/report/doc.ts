import type { TiptapDoc, TiptapNode } from "./types";

/**
 * Builders and utilities for the report document (TipTap/ProseMirror JSON).
 * Isomorphic: used by the server (generation, exports) and the editor.
 */

export const DATA_BLOCK_KINDS = [
  "keyPoints",
  "findings",
  "station",
  "asbuilt",
  "billing",
  "actions",
  "checklist",
  "photoRegister",
  "measurements",
  "transcript",
  "participants",
] as const;
export type DataBlockKind = (typeof DATA_BLOCK_KINDS)[number];
export const DATA_BLOCK_LABELS: Record<DataBlockKind, string> = {
  keyPoints: "Tabel belangrijkste aandachtspunten",
  findings: "Overzicht bevindingen",
  station: "Installatiebeschrijving",
  asbuilt: "As-built-check",
  billing: "Afrekenonderbouwing",
  actions: "Actiepunten",
  checklist: "Checklistresultaten",
  photoRegister: "Fotoregister",
  measurements: "Metingen",
  transcript: "Transcriptie",
  participants: "Deelnemers en handtekeningen",
};

export const text = (value: string): TiptapNode => ({ type: "text", text: value });

export function paragraph(value: string | null | undefined): TiptapNode {
  const v = (value ?? "").trim();
  return v ? { type: "paragraph", content: [text(v)] } : { type: "paragraph" };
}

/** Multi-line text → paragraphs. */
export function paragraphs(value: string | null | undefined): TiptapNode[] {
  return (value ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(p));
}

export const heading = (value: string, level = 3): TiptapNode => ({ type: "heading", attrs: { level }, content: [text(value)] });
export const photo = (captureId: string, caption = ""): TiptapNode => ({ type: "photo", attrs: { captureId, caption } });
export const photoGrid = (captureIds: string[], caption = ""): TiptapNode => ({ type: "photoGrid", attrs: { captureIds, caption } });
export const mapSnapshot = (bbox: number[] | null = null): TiptapNode => ({ type: "mapSnapshot", attrs: { bbox } });
export const findingRef = (findingId: string): TiptapNode => ({ type: "findingRef", attrs: { findingId } });
export const dataBlock = (kind: DataBlockKind): TiptapNode => ({ type: "dataBlock", attrs: { kind } });

export function table(columns: string[], rows: string[][], caption?: string | null): TiptapNode[] {
  const cell = (type: "tableHeader" | "tableCell", v: string): TiptapNode => ({ type, content: [paragraph(v)] });
  const node: TiptapNode = {
    type: "table",
    content: [
      { type: "tableRow", content: columns.map((c) => cell("tableHeader", c)) },
      ...rows.map((r) => ({ type: "tableRow", content: columns.map((_, i) => cell("tableCell", r[i] ?? "")) })),
    ],
  };
  return caption ? [node, { type: "paragraph", content: [{ type: "text", text: caption, marks: [{ type: "italic" }] }] }] : [node];
}

export function section(key: string, title: string, content: TiptapNode[]): TiptapNode {
  return { type: "reportSection", attrs: { key, title }, content: content.length ? content : [paragraph("")] };
}

export function doc(sections: TiptapNode[]): TiptapDoc {
  return { type: "doc", content: sections };
}

export function getSections(d: TiptapDoc): TiptapNode[] {
  return (d.content ?? []).filter((n) => n.type === "reportSection");
}

export function sectionByKey(d: TiptapDoc, key: string): TiptapNode | undefined {
  return getSections(d).find((s) => s.attrs?.key === key);
}

export function replaceSection(d: TiptapDoc, key: string, next: TiptapNode): TiptapDoc {
  let found = false;
  const content = d.content.map((n) => {
    if (n.type === "reportSection" && n.attrs?.key === key) {
      found = true;
      return next;
    }
    return n;
  });
  return { type: "doc", content: found ? content : [...content, next] };
}

/** Deterministic JSON (sorted keys) for hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** FNV-1a 64-bit hash (hex) — fast, dependency-free, identical in browser and Node. */
export function hashString(input: string): string {
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/** Hash of a section's content (title excluded), to detect manual edits. */
export function sectionHash(node: TiptapNode): string {
  return hashString(stableStringify(node.content ?? []));
}

/** All capture ids referenced by photo nodes in a document. */
export function referencedCaptureIds(d: TiptapDoc | TiptapNode): string[] {
  const out: string[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === "photo" && typeof n.attrs?.captureId === "string") out.push(n.attrs.captureId);
    if (n.type === "photoGrid" && Array.isArray(n.attrs?.captureIds)) out.push(...(n.attrs.captureIds as string[]));
    n.content?.forEach(walk);
  };
  walk(d as TiptapNode);
  return out;
}

/** Plain text of a node (for diffs and search). */
export function nodeText(n: TiptapNode): string {
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(nodeText).join(n.type === "tableRow" ? " | " : "");
  const block = ["paragraph", "heading", "tableRow", "listItem", "reportSection"].includes(n.type);
  return block ? `${inner}\n` : inner;
}

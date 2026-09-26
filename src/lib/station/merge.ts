import { emptyStationDescription, type StationDescription } from "./schema";
import type { FieldMeta, FieldSource, StationDescriptionDoc } from "./types";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isObjectArray(v: unknown): v is Record<string, Json>[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}
/** Arrays of objects in the schema (merged element-wise). */
const OBJECT_ARRAY_PATHS = new Set(["mv_switchgear.velden", "transformers", "lv_board.groepen"]);

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  let cursor = obj as unknown as Record<string, unknown>;
  keys.forEach((key, idx) => {
    if (idx === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    const nextIsIndex = /^\d+$/.test(keys[idx + 1]!);
    if (cursor[key] === undefined || cursor[key] === null) cursor[key] = nextIsIndex ? [] : {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  return obj;
}

function isLocked(meta: Record<string, FieldMeta>, path: string): boolean {
  // Locked when the path itself or any ancestor path was edited manually.
  const parts = path.split(".");
  for (let i = parts.length; i > 0; i--) {
    const p = parts.slice(0, i).join(".");
    if (meta[p]?.source === "handmatig") return true;
  }
  return false;
}

function hasLockedDescendant(meta: Record<string, FieldMeta>, path: string): boolean {
  return Object.entries(meta).some(([k, m]) => k.startsWith(`${path}.`) && m.source === "handmatig");
}

/**
 * Merge a fresh AI description into an existing document. Manually edited
 * fields (and everything below a manually edited array) are never
 * overwritten. A null from the AI never erases a previously known value.
 */
export function mergeAiDescription(
  existing: StationDescriptionDoc | null,
  ai: StationDescription,
  confidence: number,
  now: Date = new Date(),
  source: FieldSource = "ai",
): StationDescriptionDoc {
  const values = structuredClone(existing?.values ?? emptyStationDescription()) as unknown as Record<string, Json>;
  const fieldMeta: Record<string, FieldMeta> = { ...(existing?.fieldMeta ?? {}) };
  const stamp = now.toISOString();

  const walk = (node: Json, path: string) => {
    if (isLocked(fieldMeta, path)) return;
    if (OBJECT_ARRAY_PATHS.has(path) && Array.isArray(node)) {
      const current = getPath(values, path);
      if (!hasLockedDescendant(fieldMeta, path)) {
        // No manual edits inside: take the AI list wholesale (if it has content).
        if (node.length > 0 || !Array.isArray(current) || current.length === 0) {
          setPath(values, path, structuredClone(node));
          for (const key of Object.keys(fieldMeta)) if (key.startsWith(`${path}.`)) delete fieldMeta[key];
          node.forEach((el, i) => markLeaves(el, `${path}.${i}`));
        }
        return;
      }
      if (!Array.isArray(current)) setPath(values, path, []);
      node.forEach((el, i) => walk(el, `${path}.${i}`));
      return;
    }
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      return;
    }
    if (isObjectArray(node)) {
      node.forEach((el, i) => walk(el, `${path}.${i}`));
      return;
    }
    // Leaf (primitive, null, or array of primitives).
    const isEmpty = node === null || (Array.isArray(node) && node.length === 0);
    const previous = getPath(values, path);
    if (isEmpty && previous !== undefined && previous !== null && !(Array.isArray(previous) && previous.length === 0)) {
      return;
    }
    setPath(values, path, structuredClone(node));
    if (!isEmpty) fieldMeta[path] = { source, confidence, updatedAt: stamp };
  };

  const markLeaves = (node: Json, path: string) => {
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) markLeaves(v, `${path}.${k}`);
      return;
    }
    const isEmpty = node === null || (Array.isArray(node) && node.length === 0);
    if (!isEmpty) fieldMeta[path] = { source, confidence, updatedAt: stamp };
  };

  walk(ai as unknown as Json, "");
  return { values: values as unknown as StationDescription, fieldMeta };
}

/** Apply a manual edit; the field (or whole array) becomes locked for AI. */
export function applyManualEdit(
  doc: StationDescriptionDoc | null,
  path: string,
  value: unknown,
  userId: string | null,
  now: Date = new Date(),
): StationDescriptionDoc {
  const next: StationDescriptionDoc = doc
    ? { values: structuredClone(doc.values), fieldMeta: { ...doc.fieldMeta } }
    : { values: emptyStationDescription(), fieldMeta: {} };
  setPath(next.values, path, value);
  next.fieldMeta[path] = { source: "handmatig", confidence: 1, updatedAt: now.toISOString(), updatedBy: userId };
  return next;
}

/** Collect every capture id referenced anywhere in a description. */
export function collectCaptureIds(desc: StationDescription): string[] {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === "capture_ids" && Array.isArray(v)) v.forEach((id) => typeof id === "string" && out.add(id));
        else walk(v);
      }
    }
  };
  walk(desc);
  return [...out];
}

/** Remove capture ids that are not in the allowed set (anti-hallucination). */
export function pruneCaptureIds(desc: StationDescription, allowed: Set<string>): { desc: StationDescription; removed: string[] } {
  const removed = new Set<string>();
  const clone = structuredClone(desc) as unknown;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === "capture_ids" && Array.isArray(v)) {
          (node as Record<string, unknown>)[k] = v.filter((id) => {
            const ok = typeof id === "string" && allowed.has(id);
            if (!ok) removed.add(String(id));
            return ok;
          });
        } else walk(v);
      }
    }
  };
  walk(clone);
  return { desc: clone as StationDescription, removed: [...removed] };
}

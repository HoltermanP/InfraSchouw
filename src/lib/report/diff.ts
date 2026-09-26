import { getSections, nodeText } from "./doc";
import type { TiptapDoc } from "./types";

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

/** Word-level diff (LCS), sufficient for report paragraphs. */
export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter((x) => x !== "");
  const B = b.split(/(\s+)/).filter((x) => x !== "");
  // Guard against quadratic blow-up on very long texts.
  if (A.length * B.length > 4_000_000) {
    return a === b ? [{ type: "same", text: a }] : [{ type: "removed", text: a }, { type: "added", text: b }];
  }
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      push("same", A[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push("removed", A[i++]!);
    else push("added", B[j++]!);
  }
  while (i < A.length) push("removed", A[i++]!);
  while (j < B.length) push("added", B[j++]!);
  return out;
}

export type SectionDiff = { key: string; title: string; status: "unchanged" | "changed" | "added" | "removed"; parts: DiffPart[] };

/** Per-section comparison of two report versions. */
export function diffReports(from: TiptapDoc, to: TiptapDoc): SectionDiff[] {
  const a = new Map(getSections(from).map((s) => [String(s.attrs?.key), s]));
  const b = new Map(getSections(to).map((s) => [String(s.attrs?.key), s]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  return keys.map((key) => {
    const sa = a.get(key);
    const sb = b.get(key);
    const title = String((sb ?? sa)?.attrs?.title ?? key);
    if (!sa) return { key, title, status: "added" as const, parts: [{ type: "added" as const, text: nodeText(sb!) }] };
    if (!sb) return { key, title, status: "removed" as const, parts: [{ type: "removed" as const, text: nodeText(sa) }] };
    const ta = `${String(sa.attrs?.title ?? "")}\n${nodeText(sa)}`;
    const tb = `${String(sb.attrs?.title ?? "")}\n${nodeText(sb)}`;
    const structural = JSON.stringify(sa.content) !== JSON.stringify(sb.content);
    if (ta === tb && !structural) return { key, title, status: "unchanged" as const, parts: [{ type: "same" as const, text: tb }] };
    const parts = diffWords(ta, tb);
    if (ta === tb && structural) parts.push({ type: "added", text: "\n[Foto's, tabellen of blokken gewijzigd]" });
    return { key, title, status: "changed" as const, parts };
  });
}

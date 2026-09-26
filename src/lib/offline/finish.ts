import type { LocalCapture, LocalChecklistAnswer } from "./db";

type FinishTemplate = {
  shots: { id: string; title: string; required: boolean }[];
  checklist: { id: string; question: string; required: boolean; photoRequired: boolean }[];
};

/**
 * Required shots without a photo and required checklist items without an
 * answer (or without the required photo). Each needs a skip reason before the
 * inspection can be finished — shared by the phone finish screen and the
 * voice-driven glasses UI.
 */
export function openFinishItems<T extends FinishTemplate>(template: T, captures: Pick<LocalCapture, "shotId">[], answers: Pick<LocalChecklistAnswer, "itemId" | "value" | "skippedReason" | "captureIds">[]) {
  const missingShots = template.shots.filter((s) => s.required && !captures.some((c) => c.shotId === s.id)) as T["shots"];
  const openItems = template.checklist.filter((c) => {
    if (!c.required) return false;
    const a = answers.find((x) => x.itemId === c.id);
    return !a || (a.value === null && !a.skippedReason) || (c.photoRequired && a.captureIds.length === 0 && !a.skippedReason);
  }) as T["checklist"];
  const keys = [...missingShots.map((s) => `shot:${s.id}`), ...openItems.map((c) => `checklist:${c.id}`)];
  return { missingShots, openItems, keys };
}

/** Turn `shot:<id>` / `checklist:<id>` keys plus reasons into the finish payload. */
export function skippedFromKeys(keys: string[], reasonFor: (key: string) => string) {
  return keys.map((k) => {
    const [kind, refId] = k.split(":") as ["shot" | "checklist", string];
    return { kind, refId, reason: reasonFor(k) };
  });
}

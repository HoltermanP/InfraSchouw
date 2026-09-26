/**
 * Rough cost estimate per job (USD) for the token log. Prices per 1M tokens;
 * unknown models fall back to a conservative default. Estimates only — the
 * OpenAI dashboard is authoritative.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-astra": { input: 5, output: 40 },
  "gpt-6-sol": { input: 3, output: 24 },
  "gpt-6-luna": { input: 0.5, output: 4 },
  "gpt-5.5": { input: 2.5, output: 20 },
  "gpt-5.1": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-4o-transcribe": { input: 2.5, output: 10 },
  "gpt-4o-transcribe-diarize": { input: 2.5, output: 10 },
  "gpt-4o-mini-transcribe": { input: 1.25, output: 5 },
  "gpt-transcribe": { input: 2.5, output: 10 },
};
const DEFAULT = { input: 2.5, output: 15 };
/** whisper-1 is billed per minute. */
const WHISPER_PER_MINUTE = 0.006;

export function estimateCost(model: string, inputTokens: number, outputTokens: number, audioSeconds = 0): number {
  if (model === "whisper-1") return Math.round((audioSeconds / 60) * WHISPER_PER_MINUTE * 1e6) / 1e6;
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  const p = key ? PRICES[key]! : DEFAULT;
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 1e6) / 1e6;
}

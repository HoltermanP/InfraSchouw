import "server-only";
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";

export type StructuredResult<T> = { data: T; inputTokens: number; outputTokens: number; model: string; retried: boolean };

/**
 * Call the Responses API with a Zod schema as strict structured output.
 * The result is validated again; on a validation failure one retry is made
 * with the error message as extra context (section 7.3).
 */
export async function structuredCall<S extends z.ZodType>(
  openai: OpenAI,
  opts: {
    model: string;
    schema: S;
    name: string;
    system: string;
    content: ResponseInputContent[];
    maxOutputTokens?: number;
    reasoningEffort?: "low" | "medium" | "high";
  },
): Promise<StructuredResult<z.infer<S>>> {
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content: ResponseInputContent[] = lastError
      ? [...opts.content, { type: "input_text", text: `Je vorige antwoord voldeed niet aan het schema: ${lastError}\nGeef een volledig geldig antwoord volgens het schema.` }]
      : opts.content;
    try {
      const res = await openai.responses.parse({
        model: opts.model,
        instructions: opts.system,
        input: [{ role: "user", content }],
        text: { format: zodTextFormat(opts.schema, opts.name) },
        max_output_tokens: opts.maxOutputTokens,
        ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
      });
      inputTokens += res.usage?.input_tokens ?? 0;
      outputTokens += res.usage?.output_tokens ?? 0;
      const parsed = opts.schema.safeParse(res.output_parsed);
      if (parsed.success) return { data: parsed.data, inputTokens, outputTokens, model: opts.model, retried: attempt > 0 };
      lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "leeg antwoord";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // API/network errors are not schema problems: surface them to the job runner.
      if (!/parse|schema|JSON|zod|validation/i.test(msg)) throw err;
      lastError = msg.slice(0, 500);
    }
  }
  throw new Error(`AI-uitvoer voldoet niet aan het schema na herkansing: ${lastError}`);
}

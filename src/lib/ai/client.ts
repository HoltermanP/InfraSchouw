import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

let client: OpenAI | null = null;

/** OpenAI client, or null when no API key is configured (AI steps are then skipped). */
export function getOpenAI(): OpenAI | null {
  if (!env.openai.enabled) return null;
  client ??= new OpenAI({ apiKey: env.openai.apiKey, baseURL: env.openai.baseUrl, maxRetries: 2, timeout: 180_000 });
  return client;
}

/** For tests: inject a client (e.g. pointing at an MSW mock server). */
export function setOpenAI(c: OpenAI | null) {
  client = c;
}

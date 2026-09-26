import type OpenAI from "openai";
import type { AiJob, AiJobOutput } from "@/db/schema";
import type { OrgCtx } from "@/db/scope";
import type { ResolvedOrgSettings } from "@/lib/org-settings";

export type JobContext = {
  job: AiJob;
  org: { id: string; settings: ResolvedOrgSettings };
  /** System context acting on behalf of the organisation (job creator as user). */
  orgCtx: OrgCtx;
  openai: OpenAI | null;
  /** False when no API key is configured or the step is turned off for the org. */
  aiEnabled: boolean;
};

export type JobOutcome = {
  skipped?: boolean;
  message?: string;
  output?: AiJobOutput;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
};

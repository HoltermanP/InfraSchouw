import { z } from "zod";
import { CHECKLIST_ANSWER_TYPES, TEMPLATE_PHASES } from "../domain";

const maybeId = z.string().uuid().optional();

export const templateInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000),
  phase: z.enum(TEMPLATE_PHASES),
  purposeText: z.string().trim().max(5000),
  aiInstructions: z.string().trim().max(5000),
  isStation: z.boolean(),
  isBilling: z.boolean(),
  tracksRoute: z.boolean(),
  active: z.boolean(),
  checklist: z
    .array(
      z.object({
        id: maybeId,
        question: z.string().trim().min(1).max(500),
        answerType: z.enum(CHECKLIST_ANSWER_TYPES),
        options: z.array(z.string().trim().min(1).max(100)).max(30),
        photoRequired: z.boolean(),
        required: z.boolean(),
      }),
    )
    .max(200),
  shots: z
    .array(
      z.object({
        id: maybeId,
        groupName: z.string().trim().min(1).max(100),
        title: z.string().trim().min(1).max(300),
        description: z.string().trim().max(1000),
        required: z.boolean(),
        stationComponent: z.string().trim().max(60).nullable(),
      }),
    )
    .max(200),
  sections: z
    .array(
      z.object({
        id: maybeId,
        key: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9_]+$/, "Alleen kleine letters, cijfers en _"),
        title: z.string().trim().min(1).max(200),
        aiHint: z.string().trim().max(2000),
      }),
    )
    .max(50),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { ClaimKindSchema, ConfidenceSchema } from "./evidence.js";
import { EmptyWriteScopesSchema } from "./analytics.js";

export const AiSearchSurfaceSchema = z.enum([
  "CHATGPT",
  "PERPLEXITY",
  "GOOGLE_AI_OVERVIEW",
  "OTHER",
]);
export type AiSearchSurface = z.infer<typeof AiSearchSurfaceSchema>;

export const AiSearchPresenceSchema = z.enum(["PRESENT", "ABSENT", "UNCLEAR"]);
export type AiSearchPresence = z.infer<typeof AiSearchPresenceSchema>;

/** Probe observations/recommendations may not be VERIFIED commercial claims. */
export const AiSearchConfidenceSchema = ConfidenceSchema.exclude(["VERIFIED"]);
export type AiSearchConfidence = z.infer<typeof AiSearchConfidenceSchema>;

export const AiSearchStatementSchema = z.object({
  text: z.string().min(1),
  kind: ClaimKindSchema,
  confidence: AiSearchConfidenceSchema,
  evidence_ids: z.array(z.string()).default([]),
});
export type AiSearchStatement = z.infer<typeof AiSearchStatementSchema>;

export const AiSearchProbeSchema = z.object({
  probe_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  question: z.string().min(1),
  surface: AiSearchSurfaceSchema,
  observed_at: z.string().datetime(),
  presence: AiSearchPresenceSchema,
  observation: AiSearchStatementSchema.extend({
    kind: z.literal("OBSERVATION"),
  }),
  recommendations: z.array(
    AiSearchStatementSchema.extend({
      kind: z.literal("RECOMMENDATION"),
    }),
  ),
  source_type: z.literal("AI_INFERENCE"),
  live_probe: z.literal(false),
  mode: z.enum(["FIXTURE", "STUB"]),
});
export type AiSearchProbe = z.infer<typeof AiSearchProbeSchema>;

export const AiSearchVisibilityReportSchema = z.object({
  brand_id: BrandIdSchema,
  generated_at: z.string().datetime(),
  mode: z.enum(["FIXTURE", "STUB"]),
  write_scopes: EmptyWriteScopesSchema,
  live_probe: z.literal(false),
  invented_verified_claims: z.literal(false),
  probes: z.array(AiSearchProbeSchema),
  summary: z.string().min(1),
});
export type AiSearchVisibilityReport = z.infer<
  typeof AiSearchVisibilityReportSchema
>;

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { ConfidenceSchema } from "./evidence.js";

export const MemoryScopeSchema = z.enum(["BRAND", "CAMPAIGN", "GLOBAL"]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

/**
 * Memory trust lifecycle.
 * Never promote unsupported AI opinion directly to TRUSTED.
 */
export const MemoryTrustStatusSchema = z.enum([
  "DRAFT",
  "REVIEWED",
  "TRUSTED",
]);
export type MemoryTrustStatus = z.infer<typeof MemoryTrustStatusSchema>;

export const MarketingMemoryItemSchema = z.object({
  memory_id: z.string().uuid(),
  scope: MemoryScopeSchema.default("BRAND"),
  trust_status: MemoryTrustStatusSchema.default("DRAFT"),
  brand_id: BrandIdSchema.optional(),
  campaign_id: z.string().uuid().optional(),
  observation: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: ConfidenceSchema,
  metric_impact: z.string().optional(),
  source: z.string().min(1),
  created_at: z.string().datetime(),
  review_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  promoted_to_global_at: z.string().datetime().optional(),
  requires_guardian_review: z.boolean().default(false),
  requires_human_approval: z.boolean().default(false),
});
export type MarketingMemoryItem = z.infer<typeof MarketingMemoryItemSchema>;

/** Global promotion rules — enforced by runtime. */
export const GLOBAL_MEMORY_PROMOTION_RULES = {
  default_scope: "BRAND" as const,
  auto_promote_to_global: false,
  require_brand_guardian: true,
  require_human_approval_level: "LEVEL_2" as const,
  min_trust_before_global: "REVIEWED" as const,
} as const;

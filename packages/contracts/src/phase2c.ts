import { z } from "zod";
import { BrandIdSchema } from "./ids.js";

/**
 * Phase 2C — human brand verification decisions.
 * PENDING must never be applied as approval.
 */
export const BrandDecisionActionSchema = z.enum([
  "PENDING",
  "VERIFY",
  "REJECT",
  "EDIT",
  "SKIP",
]);
export type BrandDecisionAction = z.infer<typeof BrandDecisionActionSchema>;

export const BrandDecisionSchema = z
  .object({
    id: z.string().min(1),
    brand_id: BrandIdSchema,
    field: z.string().min(1),
    candidate_value: z.unknown().optional(),
    decision: BrandDecisionActionSchema.default("PENDING"),
    corrected_value: z.unknown().optional(),
    operator_notes: z.string().optional(),
    /** Explicit marketing authorization — separate from VERIFY. */
    marketing_approved: z.boolean().default(false),
    requires_marketing_approval: z.boolean().default(false),
    decided_by: z.string().optional(),
    decided_at: z.string().datetime().optional(),
    evidence_candidate_ids: z.array(z.string()).default([]),
    category: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.decision === "EDIT" && d.corrected_value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Decision ${d.id}: EDIT requires corrected_value`,
      });
    }
    if (
      (d.decision === "VERIFY" || d.decision === "EDIT") &&
      d.requires_marketing_approval &&
      !d.marketing_approved
    ) {
      // Allowed to VERIFY into knowledge, but apply layer blocks marketing surfaces.
      // Schema allows VERIFY without marketing_approved; apply enforces surfaces.
    }
    if (d.decision !== "PENDING" && d.decision !== "SKIP") {
      if (!d.decided_by || !d.decided_by.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Decision ${d.id}: decided_by required when decision is not PENDING/SKIP`,
        });
      }
      if (!d.decided_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Decision ${d.id}: decided_at required when decision is not PENDING/SKIP`,
        });
      }
    }
  });
export type BrandDecision = z.infer<typeof BrandDecisionSchema>;

export const BrandDecisionBatchSchema = z.object({
  /** phase2c = human verification pass; phase2d = critical-blocker clearance pass */
  version: z.enum(["phase2c", "phase2d"]),
  generated_at: z.string().datetime(),
  notes: z.string().optional(),
  decisions: z.array(BrandDecisionSchema),
});
export type BrandDecisionBatch = z.infer<typeof BrandDecisionBatchSchema>;

export const ApplyDecisionsResultSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped_pending: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  readiness: z.record(z.string(), z.unknown()).optional(),
  audit_path: z.string().optional(),
});
export type ApplyDecisionsResult = z.infer<typeof ApplyDecisionsResultSchema>;

/** High-risk claim language — VERIFY ≠ marketing approval. */
export function isHighRiskMarketingClaim(text: string): boolean {
  return (
    /\b\d+\s*[-–—]\s*\d+%\s*roi\b/i.test(text) ||
    /\broi\b/i.test(text) ||
    /\bguaranteed?\b/i.test(text) ||
    /\binvestment\s+return/i.test(text) ||
    /\bbest\s+in\s+(the\s+)?(world|uae|market)\b/i.test(text) ||
    /\bno\s*#?\s*1\b/i.test(text) ||
    /\b\d+%\s+(increase|growth|conversion|lift)\b/i.test(text)
  );
}

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import {
  ConfidenceSchema,
  KnowledgeStatusSchema,
  SourceTypeSchema,
} from "./evidence.js";

/**
 * NOX TECH (and similar) capability claim maturity.
 * OBSERVED_IN_CODE ≠ MARKETING_APPROVED.
 */
export const CapabilityClaimStateSchema = z.enum([
  "OBSERVED_IN_CODE",
  "DOCUMENTED",
  "PUBLICLY_CLAIMED",
  "MARKETING_APPROVED",
  "CASE_STUDY_SUPPORTED",
]);
export type CapabilityClaimState = z.infer<typeof CapabilityClaimStateSchema>;

export const EvidenceCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  brand_id: BrandIdSchema,
  field_path: z.string().min(1),
  candidate_value: z.unknown(),
  source_repository: z.string().min(1),
  relative_source_path: z.string().min(1),
  source_type: SourceTypeSchema,
  evidence_summary: z.string().min(1),
  observed_at: z.string().datetime(),
  verification_status: KnowledgeStatusSchema,
  confidence: ConfidenceSchema,
  status_reason: z.string().min(1),
  rejected: z.boolean().default(false),
  rejection_reason: z.string().optional(),
  placeholder_filtered: z.boolean().default(false),
  capability_claim_state: CapabilityClaimStateSchema.optional(),
  time_sensitive: z.boolean().default(false),
  review_after_days: z.number().int().positive().optional(),
});
export type EvidenceCandidate = z.infer<typeof EvidenceCandidateSchema>;

export const EvidenceLedgerSchema = z.object({
  brand_id: BrandIdSchema,
  generated_at: z.string().datetime(),
  pipeline: z.literal("PHASE_2B"),
  candidates: z.array(EvidenceCandidateSchema),
});
export type EvidenceLedger = z.infer<typeof EvidenceLedgerSchema>;

export const HumanReviewActionSchema = z.enum([
  "VERIFY",
  "REJECT",
  "RESOLVE_CONFLICT",
  "MARK_STALE",
  "APPROVE_MARKETING_CLAIM",
  "APPROVE_CROSS_BRAND_RELATIONSHIP",
]);
export type HumanReviewAction = z.infer<typeof HumanReviewActionSchema>;

export const HumanReviewItemSchema = z.object({
  review_id: z.string().min(1),
  brand_id: BrandIdSchema,
  action: HumanReviewActionSchema,
  priority: z.enum(["CRITICAL", "IMPORTANT", "ENHANCEMENT"]),
  field_path: z.string().min(1),
  candidate_value: z.unknown(),
  question: z.string().min(1),
  source_context: z.string().min(1),
  evidence_candidate_ids: z.array(z.string()).default([]),
});
export type HumanReviewItem = z.infer<typeof HumanReviewItemSchema>;

export const HumanReviewQueueSchema = z.object({
  generated_at: z.string().datetime(),
  items: z.array(HumanReviewItemSchema),
});
export type HumanReviewQueue = z.infer<typeof HumanReviewQueueSchema>;

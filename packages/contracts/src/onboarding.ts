import { z } from "zod";
import { BrandIdSchema } from "./ids.js";

export const OnboardingStateSchema = z.enum([
  "DISCOVER",
  "INGEST",
  "NORMALIZE",
  "VALIDATE",
  "GAP_ANALYSIS",
  "HUMAN_REVIEW",
  "BRAND_READY",
]);
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export const LEGAL_ONBOARDING_TRANSITIONS: Record<
  OnboardingState,
  readonly OnboardingState[]
> = {
  DISCOVER: ["INGEST", "GAP_ANALYSIS"],
  INGEST: ["NORMALIZE", "DISCOVER"],
  NORMALIZE: ["VALIDATE", "INGEST"],
  VALIDATE: ["GAP_ANALYSIS", "NORMALIZE"],
  GAP_ANALYSIS: ["HUMAN_REVIEW", "VALIDATE"],
  HUMAN_REVIEW: ["BRAND_READY", "INGEST", "GAP_ANALYSIS"],
  BRAND_READY: ["HUMAN_REVIEW"], // can reopen for updates
};

export function canTransitionOnboarding(
  from: OnboardingState,
  to: OnboardingState,
): boolean {
  return LEGAL_ONBOARDING_TRANSITIONS[from].includes(to);
}

export const ReadinessAreaSchema = z.enum([
  "identity",
  "positioning",
  "products_services",
  "audiences",
  "tone",
  "visual_identity",
  "channels",
  "claims_restrictions",
  "ctas",
  "evidence_quality",
]);
export type ReadinessArea = z.infer<typeof ReadinessAreaSchema>;

export const ReadinessAreaScoreSchema = z.object({
  area: ReadinessAreaSchema,
  /** 0–100; unverified population does not score highly. */
  score: z.number().min(0).max(100),
  verified_count: z.number().int().nonnegative(),
  unverified_count: z.number().int().nonnegative(),
  missing_count: z.number().int().nonnegative(),
  conflicting_count: z.number().int().nonnegative(),
  stale_count: z.number().int().nonnegative(),
  critical_blockers: z.array(z.string()).default([]),
});
export type ReadinessAreaScore = z.infer<typeof ReadinessAreaScoreSchema>;

export const BrandReadinessReportSchema = z.object({
  brand_id: BrandIdSchema,
  onboarding_state: OnboardingStateSchema,
  /** Overall 0–100 — weighted; unverified mass does not inflate. */
  overall_score: z.number().min(0).max(100),
  readiness_status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "BLOCKED",
    "READY_FOR_INTERNAL_DRAFTS",
    "BRAND_READY",
  ]),
  areas: z.array(ReadinessAreaScoreSchema),
  critical_blockers: z.array(z.string()),
  missing: z.array(z.string()),
  unverified: z.array(z.string()),
  conflicting: z.array(z.string()),
  stale: z.array(z.string()),
  verified: z.array(z.string()),
  recommended_documents: z.array(z.string()),
  recommended_human_questions: z.array(z.string()),
  next_actions: z.array(z.string()),
  guardian_passed: z.boolean(),
  guardian_reasons: z.array(z.string()).default([]),
  generated_at: z.string().datetime(),
});
export type BrandReadinessReport = z.infer<typeof BrandReadinessReportSchema>;

export const OnboardingRecordSchema = z.object({
  brand_id: BrandIdSchema,
  state: OnboardingStateSchema,
  updated_at: z.string().datetime(),
  notes: z.string().optional(),
});
export type OnboardingRecord = z.infer<typeof OnboardingRecordSchema>;

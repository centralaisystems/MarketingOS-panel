import { z } from "zod";
import { BrandIdSchema } from "./ids.js";

/** Dry-run is the default. Live Resend only when MOS_EMAIL_MODE=resend. */
export const EmailModeSchema = z.enum(["dry_run", "resend"]);
export type EmailMode = z.infer<typeof EmailModeSchema>;

/**
 * Templated messages only — no freestyle agent email.
 * ADS_PROGRESS_STUB is a read-only placeholder (Wave 6 not unlocked).
 */
export const EmailTemplateKindSchema = z.enum([
  "MATERIALS_READY",
  "PROGRESS_DIGEST",
  "ADS_PROGRESS_STUB",
]);
export type EmailTemplateKind = z.infer<typeof EmailTemplateKindSchema>;

export const EmailOutboxStatusSchema = z.enum([
  "RECORDED",
  "SENT",
  "BLOCKED",
  "FAILED",
]);
export type EmailOutboxStatus = z.infer<typeof EmailOutboxStatusSchema>;

export const PackReviewFieldsSchema = z.object({
  pack_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  objective: z.string().min(1),
  generated_at: z.string().datetime(),
  approval_level_cap: z.string().min(1),
  guardian_passed: z.boolean(),
  guardian_reasons: z.array(z.string()).default([]),
  guardian_reviewed: z.array(z.string()).default([]),
  approvable: z.boolean(),
  content_draft_count: z.number().int().nonnegative(),
  creative_brief_count: z.number().int().nonnegative(),
  video_brief_count: z.number().int().nonnegative(),
  has_social_calendar: z.boolean(),
  has_paid_recommendations: z.boolean(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  /** Optional Figma-arrange outputs for later owner review. Empty until a job exists. */
  arranged_asset_ids: z.array(z.string().uuid()).default([]),
  figma_job_ids: z.array(z.string().uuid()).default([]),
  /** Optional Higgsfield fill-gap stills. Empty until a generate job exists. */
  generated_asset_ids: z.array(z.string().uuid()).default([]),
  higgsfield_job_ids: z.array(z.string().uuid()).default([]),
});
export type PackReviewFields = z.infer<typeof PackReviewFieldsSchema>;

export const EmailOutboxItemSchema = z.object({
  outbox_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  template: EmailTemplateKindSchema,
  mode: EmailModeSchema,
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().min(1),
  text_body: z.string().min(1),
  html_body: z.string().min(1),
  review_url: z.string().url().optional(),
  review_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  pack_id: z.string().uuid().optional(),
  /** Pack/approval/digest fields only — never invented VERIFIED claims. */
  payload: z.record(z.unknown()).default({}),
  status: EmailOutboxStatusSchema,
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  created_at: z.string().datetime(),
  provider_message_id: z.string().optional(),
});
export type EmailOutboxItem = z.infer<typeof EmailOutboxItemSchema>;

export const OwnerReviewStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
]);
export type OwnerReviewStatus = z.infer<typeof OwnerReviewStatusSchema>;

export const OwnerReviewRequestSchema = z.object({
  review_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  approval_id: z.string().uuid().optional(),
  token: z.string().min(16),
  status: OwnerReviewStatusSchema,
  review_url: z.string().url(),
  template: EmailTemplateKindSchema.default("MATERIALS_READY"),
  arranged_asset_ids: z.array(z.string().uuid()).default([]),
  figma_job_ids: z.array(z.string().uuid()).default([]),
  generated_asset_ids: z.array(z.string().uuid()).default([]),
  higgsfield_job_ids: z.array(z.string().uuid()).default([]),
  created_at: z.string().datetime(),
  decided_at: z.string().datetime().optional(),
});
export type OwnerReviewRequest = z.infer<typeof OwnerReviewRequestSchema>;

export const OwnerReviewActionSchema = z.enum(["APPROVED", "CHANGES_REQUESTED"]);
export type OwnerReviewAction = z.infer<typeof OwnerReviewActionSchema>;

export const OwnerReviewDecisionSchema = z.object({
  decision_id: z.string().uuid(),
  review_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  decision: OwnerReviewActionSchema,
  note: z.string().default(""),
  actor: z.string().min(1),
  created_at: z.string().datetime(),
  revision_task_id: z.string().uuid().optional(),
  guardian: z
    .object({
      passed: z.boolean(),
      reasons: z.array(z.string()).default([]),
      reviewed: z.array(z.string()).default([]),
    })
    .optional(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
});
export type OwnerReviewDecision = z.infer<typeof OwnerReviewDecisionSchema>;

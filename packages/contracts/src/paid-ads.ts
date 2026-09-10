import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";
import { PaidRecommendationSchema } from "./agency.js";

export const AdPlatformSchema = z.enum(["META", "GOOGLE"]);
export type AdPlatform = z.infer<typeof AdPlatformSchema>;

/** Villa Glory first platform. Google is schema-ready and fixture-wired. */
export const WAVE6_FIRST_PLATFORM = "META" as const;

export const AdStagingModeSchema = z.enum(["STAGING", "LIVE"]);
export type AdStagingMode = z.infer<typeof AdStagingModeSchema>;

export const AdOutboxStatusSchema = z.enum([
  "STAGING_RECORDED",
  "LIVE_BLOCKED",
]);
export type AdOutboxStatus = z.infer<typeof AdOutboxStatusSchema>;

export const AdStagingActionSchema = z.enum(["LAUNCH", "BUDGET_MUTATION"]);
export type AdStagingAction = z.infer<typeof AdStagingActionSchema>;

export const AdAdapterIdSchema = z.enum([
  "meta_ads_staging",
  "google_ads_staging",
]);
export type AdAdapterId = z.infer<typeof AdAdapterIdSchema>;

/**
 * Budget is a recommendation only. Wave 6 never mutates live spend.
 * `mutation_allowed` stays false while `live_ads_allowed` is false.
 */
export const AdBudgetRecommendationSchema = z.object({
  kind: z.literal("RECOMMENDATION").default("RECOMMENDATION"),
  notes: z.array(z.string()).default([]),
  mutation_allowed: z.literal(false).default(false),
  launch_allowed: z.literal(false).default(false),
});
export type AdBudgetRecommendation = z.infer<
  typeof AdBudgetRecommendationSchema
>;

/** Intended Meta/Google campaign payload — never sent while live_ads_allowed is false. */
export const AdCampaignDraftSchema = z.object({
  brand_id: BrandIdSchema,
  platform: AdPlatformSchema,
  environment: z.literal("non-prod").default("non-prod"),
  adapter: AdAdapterIdSchema,
  objective: z.string().min(1),
  audience_notes: z.array(z.string()).default([]),
  creative_notes: z.array(z.string()).default([]),
  test_plan: z.array(z.string()).default([]),
  budget: AdBudgetRecommendationSchema,
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  launch_allowed: z.literal(false).default(false),
});
export type AdCampaignDraft = z.infer<typeof AdCampaignDraftSchema>;

export const AdPlatformFixtureSchema = z.object({
  brand_id: BrandIdSchema,
  platform: AdPlatformSchema,
  environment: z.literal("non-prod"),
  adapter: AdAdapterIdSchema,
  write_scopes: z.array(z.string()).max(0).default([]),
  live_credentials_required: z.literal(false).default(false),
  note: z.string().min(1),
});
export type AdPlatformFixture = z.infer<typeof AdPlatformFixtureSchema>;

export const AdStageRequestSchema = z.object({
  brand_id: BrandIdSchema,
  campaign_id: z.string().uuid(),
  platform: AdPlatformSchema.default("META"),
  action: AdStagingActionSchema.default("LAUNCH"),
  actor: z.string().min(1),
  rationale: z.string().min(1),
  staging: z.literal(true).default(true),
  live: z.literal(false).default(false),
});
export type AdStageRequest = z.infer<typeof AdStageRequestSchema>;

export const AdOutboxItemSchema = z.object({
  outbox_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  platform: AdPlatformSchema,
  action: AdStagingActionSchema,
  mode: AdStagingModeSchema,
  status: AdOutboxStatusSchema,
  staging: z.boolean(),
  would_launch: z.boolean(),
  would_mutate_budget: z.literal(false).default(false),
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  campaign_draft: AdCampaignDraftSchema,
  budget: AdBudgetRecommendationSchema,
  recommendation: PaidRecommendationSchema.optional(),
  actor: z.string().min(1),
  rationale: z.string().min(1),
  approval_id: z.string().uuid().optional(),
  approval_level: ApprovalLevelSchema.optional(),
  live_ads_allowed: z.boolean().default(false),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  external_side_effects: z.literal(false).default(false),
  created_at: z.string().datetime(),
});
export type AdOutboxItem = z.infer<typeof AdOutboxItemSchema>;

export const AdStagingJobSchema = z.object({
  job_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  platform: AdPlatformSchema,
  action: AdStagingActionSchema,
  mode: AdStagingModeSchema,
  status: AdOutboxStatusSchema,
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  outbox_id: z.string().uuid(),
  campaign_draft: AdCampaignDraftSchema,
  budget: AdBudgetRecommendationSchema,
  actor: z.string().min(1),
  rationale: z.string().min(1),
  live_ads_allowed: z.boolean().default(false),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  external_side_effects: z.literal(false).default(false),
  created_at: z.string().datetime(),
});
export type AdStagingJob = z.infer<typeof AdStagingJobSchema>;

export const AdStagingResultSchema = z.object({
  brand_id: BrandIdSchema,
  platform: AdPlatformSchema,
  action: AdStagingActionSchema,
  status: z.enum(["STAGING_OK", "LIVE_BLOCKED", "BLOCKED", "ERROR"]),
  message: z.string().min(1),
  staging: z.boolean(),
  would_launch: z.boolean(),
  would_mutate_budget: z.literal(false).default(false),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  live_ads_allowed: z.boolean().default(false),
  external_side_effects: z.literal(false).default(false),
  job: AdStagingJobSchema.optional(),
  outbox: AdOutboxItemSchema.optional(),
});
export type AdStagingResult = z.infer<typeof AdStagingResultSchema>;

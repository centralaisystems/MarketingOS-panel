import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";

/** Phase / wave gates for external side effects. */
export const AgencyWaveSchema = z.enum([
  "WAVE_1_REGISTRY",
  "WAVE_2_CONTENT_FACTORY",
  "WAVE_3_DB_PANEL",
  "WAVE_4_ANALYTICS_ASSETS",
  "WAVE_4B_ASSET_PIPELINE",
  "WAVE_5_SOCIAL_PUBLISH",
  "WAVE_6_PAID_ADS",
  "WAVE_7_CRM",
  "WAVE_8_AUTOMATION_DASHBOARD",
]);
export type AgencyWave = z.infer<typeof AgencyWaveSchema>;

export const PhaseGateStateSchema = z.object({
  updated_at: z.string().datetime(),
  /** Waves that operator has explicitly enabled for execution (not just planning). */
  enabled_waves: z.array(AgencyWaveSchema).default([
    "WAVE_1_REGISTRY",
    "WAVE_2_CONTENT_FACTORY",
    "WAVE_3_DB_PANEL",
    "WAVE_4_ANALYTICS_ASSETS",
    "WAVE_4B_ASSET_PIPELINE",
  ]),
  live_publish_allowed: z.boolean().default(false),
  live_ads_allowed: z.boolean().default(false),
  notes: z.string().optional(),
});
export type PhaseGateState = z.infer<typeof PhaseGateStateSchema>;

export const CampaignPackSchema = z.object({
  pack_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  objective: z.string().min(1),
  generated_at: z.string().datetime(),
  approval_level_cap: ApprovalLevelSchema.default("LEVEL_1"),
  research: z.unknown().optional(),
  competitor: z.unknown().optional(),
  strategy: z.unknown().optional(),
  content_drafts: z.array(z.unknown()).default([]),
  social_calendar: z.unknown().optional(),
  creative_briefs: z.array(z.unknown()).default([]),
  video_briefs: z.array(z.unknown()).default([]),
  seo_plan: z.unknown().optional(),
  paid_recommendations: z.unknown().optional(),
  guardian: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string()).default([]),
    /** Human-facing draft subjects Guardian actually reviewed. */
    reviewed: z.array(z.string()).default([]),
  }),
  /** Fail-closed: pack is not approval-ready unless Guardian passed all reviewed drafts. */
  approvable: z.boolean().default(false),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
});
export type CampaignPack = z.infer<typeof CampaignPackSchema>;

export const DryRunPublishRequestSchema = z.object({
  brand_id: BrandIdSchema,
  channel: z.enum(["INSTAGRAM", "LINKEDIN", "FACEBOOK", "X", "TIKTOK"]),
  caption: z.string().min(1),
  scheduled_at: z.string().datetime().optional(),
  dry_run: z.literal(true).default(true),
});
export type DryRunPublishRequest = z.infer<typeof DryRunPublishRequestSchema>;

export const DryRunPublishResultSchema = z.object({
  brand_id: BrandIdSchema,
  channel: z.string(),
  status: z.enum(["DRY_RUN_OK", "BLOCKED", "ERROR"]),
  message: z.string(),
  would_publish: z.boolean(),
});
export type DryRunPublishResult = z.infer<typeof DryRunPublishResultSchema>;

export const PaidRecommendationSchema = z.object({
  brand_id: BrandIdSchema,
  platform: z.enum(["META", "GOOGLE"]),
  objective: z.string(),
  audience_notes: z.array(z.string()).default([]),
  creative_notes: z.array(z.string()).default([]),
  budget_notes: z.array(z.string()).default([]),
  test_plan: z.array(z.string()).default([]),
  launch_allowed: z.literal(false).default(false),
});
export type PaidRecommendation = z.infer<typeof PaidRecommendationSchema>;

export const LeadRecordSchema = z.object({
  lead_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  /** Opaque handle — never put raw PII in prompts or global memory. */
  pii_ref: z.string().min(1),
  source: z.enum(["FORM", "WHATSAPP", "MANUAL", "OTHER"]),
  campaign_id: z.string().uuid().optional(),
  stage: z.enum(["NEW", "QUALIFIED", "OPPORTUNITY", "WON", "LOST"]),
  created_at: z.string().datetime(),
});
export type LeadRecord = z.infer<typeof LeadRecordSchema>;

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { EmptyWriteScopesSchema } from "./analytics.js";

/** Operator cadence. Local/CLI trigger now; production cron is documented, not shipped. */
export const DigestPeriodSchema = z.enum(["daily", "weekly"]);
export type DigestPeriod = z.infer<typeof DigestPeriodSchema>;

export const DigestItemSchema = z.object({
  brand_id: BrandIdSchema,
  headline: z.string().min(1),
  severity: z.enum(["INFO", "WARN"]),
});
export type DigestItem = z.infer<typeof DigestItemSchema>;

/**
 * Count-only Today summary. Never include raw email/phone or lead contact fields.
 * Lead identity is a count + optional opaque pii_ref list (not required on the digest).
 */
export const DigestCountsSchema = z.object({
  campaign_count: z.number().int().nonnegative(),
  draft_count: z.number().int().nonnegative(),
  pending_approval_count: z.number().int().nonnegative(),
  pending_owner_review_count: z.number().int().nonnegative(),
  social_outbox_count: z.number().int().nonnegative(),
  ad_outbox_count: z.number().int().nonnegative(),
  lead_count: z.number().int().nonnegative(),
  attributed_lead_count: z.number().int().nonnegative(),
});
export type DigestCounts = z.infer<typeof DigestCountsSchema>;

export const DigestAnalyticsStubSchema = z.object({
  status: z.literal("FIXTURE"),
  live_keys_used: z.literal(false),
  write_scopes: EmptyWriteScopesSchema,
  provider_count: z.number().int().nonnegative(),
  rows_with_valid_utm: z.number().int().nonnegative(),
  rows_missing_or_invalid_utm: z.number().int().nonnegative(),
  note: z.string().min(1),
});
export type DigestAnalyticsStub = z.infer<typeof DigestAnalyticsStubSchema>;

export const DigestCostsPlaceholderSchema = z.object({
  status: z.literal("PLACEHOLDER"),
  live_spend: z.literal(false),
  currency: z.string().min(1).default("USD"),
  staged_recommendation_count: z.number().int().nonnegative(),
  note: z.string().min(1),
});
export type DigestCostsPlaceholder = z.infer<typeof DigestCostsPlaceholderSchema>;

export const AutomationDigestStatusSchema = z.enum(["BUILT", "RECORDED", "BLOCKED"]);
export type AutomationDigestStatus = z.infer<typeof AutomationDigestStatusSchema>;

export const AutomationDigestSchema = z.object({
  digest_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  period: DigestPeriodSchema,
  generated_at: z.string().datetime(),
  window_start: z.string().datetime(),
  window_end: z.string().datetime(),
  display_name: z.string().min(1),
  counts: DigestCountsSchema,
  analytics: DigestAnalyticsStubSchema,
  costs: DigestCostsPlaceholderSchema,
  items: z.array(DigestItemSchema).default([]),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  automation_enabled: z.boolean(),
  owner_email_enabled: z.boolean(),
  email_mode: z.enum(["dry_run", "resend"]),
  /** Count-only payload. Must never contain raw email/phone. */
  payload: z.record(z.unknown()).default({}),
});
export type AutomationDigest = z.infer<typeof AutomationDigestSchema>;

export const AutomationDigestRecordSchema = z.object({
  digest_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  period: DigestPeriodSchema,
  generated_at: z.string().datetime(),
  window_start: z.string().datetime(),
  window_end: z.string().datetime(),
  status: AutomationDigestStatusSchema,
  blocked_reason: z.string().optional(),
  email_outbox_id: z.string().uuid().optional(),
  summary: DigestCountsSchema,
  analytics: DigestAnalyticsStubSchema,
  costs: DigestCostsPlaceholderSchema,
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  created_at: z.string().datetime(),
});
export type AutomationDigestRecord = z.infer<typeof AutomationDigestRecordSchema>;

export const CampaignDashboardCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  awaiting_owner: z.number().int().nonnegative(),
  changes_requested: z.number().int().nonnegative(),
  internal_approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  approvable: z.number().int().nonnegative(),
});
export type CampaignDashboardCounts = z.infer<typeof CampaignDashboardCountsSchema>;

export const ApprovalDashboardCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
});
export type ApprovalDashboardCounts = z.infer<typeof ApprovalDashboardCountsSchema>;

export const LeadDashboardCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  attributed: z.number().int().nonnegative(),
  unattributed: z.number().int().nonnegative(),
  form: z.number().int().nonnegative(),
  whatsapp: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});
export type LeadDashboardCounts = z.infer<typeof LeadDashboardCountsSchema>;

export const ExecutiveDashboardSchema = z.object({
  brand_id: BrandIdSchema,
  display_name: z.string().min(1),
  generated_at: z.string().datetime(),
  automation_enabled: z.boolean(),
  owner_email_enabled: z.boolean(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  today: DigestCountsSchema,
  campaigns: CampaignDashboardCountsSchema,
  approvals: ApprovalDashboardCountsSchema,
  leads: LeadDashboardCountsSchema,
  analytics: DigestAnalyticsStubSchema,
  costs: DigestCostsPlaceholderSchema,
  latest_digest: AutomationDigestRecordSchema.optional(),
});
export type ExecutiveDashboard = z.infer<typeof ExecutiveDashboardSchema>;

export const DigestRunResultSchema = z.object({
  brand_id: BrandIdSchema,
  period: DigestPeriodSchema,
  digest: AutomationDigestSchema,
  record: AutomationDigestRecordSchema,
  status: z.enum(["RECORDED", "BLOCKED"]),
  blocked_reason: z.string().optional(),
  email_outbox_id: z.string().uuid().optional(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
});
export type DigestRunResult = z.infer<typeof DigestRunResultSchema>;

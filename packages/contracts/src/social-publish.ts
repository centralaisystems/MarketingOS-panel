import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";

/** Wave 5 first channel. Other channels stay schema-ready but not wired. */
export const SocialChannelSchema = z.enum([
  "INSTAGRAM",
  "LINKEDIN",
  "FACEBOOK",
  "X",
  "TIKTOK",
]);
export type SocialChannel = z.infer<typeof SocialChannelSchema>;

export const WAVE5_FIRST_CHANNEL = "INSTAGRAM" as const;

export const SocialPublishModeSchema = z.enum(["DRY_RUN", "LIVE"]);
export type SocialPublishMode = z.infer<typeof SocialPublishModeSchema>;

export const SocialPublishOutboxStatusSchema = z.enum([
  "DRY_RUN_RECORDED",
  "LIVE_BLOCKED",
]);
export type SocialPublishOutboxStatus = z.infer<
  typeof SocialPublishOutboxStatusSchema
>;

/** Intended Instagram Graph-shaped payload — never sent in Wave 5 dry-run. */
export const IntendedSocialPostPayloadSchema = z.object({
  brand_id: BrandIdSchema,
  channel: SocialChannelSchema,
  environment: z.literal("non-prod").default("non-prod"),
  adapter: z.literal("instagram_graph_dry_run").default("instagram_graph_dry_run"),
  caption: z.string().min(1),
  scheduled_at: z.string().datetime().optional(),
  asset_ids: z.array(z.string().uuid()).default([]),
  media_uris: z.array(z.string().min(1)).default([]),
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  calendar_item_key: z.string().min(1),
  calendar_idea: z.string().min(1).optional(),
});
export type IntendedSocialPostPayload = z.infer<
  typeof IntendedSocialPostPayloadSchema
>;

export const SocialCalendarItemSchema = z.object({
  key: z.string().min(1),
  idea: z.string().min(1),
  caption: z.string().min(1),
});
export type SocialCalendarItem = z.infer<typeof SocialCalendarItemSchema>;

export const InstagramChannelFixtureSchema = z.object({
  brand_id: BrandIdSchema,
  channel: z.literal("INSTAGRAM"),
  environment: z.literal("non-prod"),
  adapter: z.literal("instagram_graph_dry_run"),
  write_scopes: z.array(z.string()).max(0).default([]),
  live_credentials_required: z.literal(false).default(false),
  note: z.string().min(1),
});
export type InstagramChannelFixture = z.infer<
  typeof InstagramChannelFixtureSchema
>;

export const SocialPublishScheduleRequestSchema = z.object({
  brand_id: BrandIdSchema,
  campaign_id: z.string().uuid(),
  calendar_item_key: z.string().min(1),
  channel: SocialChannelSchema.default("INSTAGRAM"),
  asset_ids: z.array(z.string().uuid()).default([]),
  scheduled_at: z.string().datetime().optional(),
  actor: z.string().min(1),
  rationale: z.string().min(1),
  dry_run: z.literal(true).default(true),
  live: z.literal(false).default(false),
});
export type SocialPublishScheduleRequest = z.infer<
  typeof SocialPublishScheduleRequestSchema
>;

export const SocialPublishOutboxRecordSchema = z.object({
  outbox_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  channel: SocialChannelSchema,
  mode: SocialPublishModeSchema,
  status: SocialPublishOutboxStatusSchema,
  dry_run: z.boolean(),
  would_publish: z.boolean(),
  caption: z.string().min(1),
  scheduled_at: z.string().datetime().optional(),
  asset_ids: z.array(z.string().uuid()).default([]),
  campaign_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  calendar_item_key: z.string().min(1),
  intended_payload: IntendedSocialPostPayloadSchema,
  actor: z.string().min(1),
  rationale: z.string().min(1),
  approval_id: z.string().uuid().optional(),
  approval_level: ApprovalLevelSchema.optional(),
  live_publish_allowed: z.boolean().default(false),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  external_side_effects: z.literal(false).default(false),
  created_at: z.string().datetime(),
});
export type SocialPublishOutboxRecord = z.infer<
  typeof SocialPublishOutboxRecordSchema
>;

export const SocialPublishResultSchema = z.object({
  brand_id: BrandIdSchema,
  channel: SocialChannelSchema,
  status: z.enum(["DRY_RUN_OK", "LIVE_BLOCKED", "BLOCKED", "ERROR"]),
  message: z.string().min(1),
  would_publish: z.boolean(),
  dry_run: z.boolean(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  live_publish_allowed: z.boolean().default(false),
  external_side_effects: z.literal(false).default(false),
  outbox: SocialPublishOutboxRecordSchema.optional(),
});
export type SocialPublishResult = z.infer<typeof SocialPublishResultSchema>;

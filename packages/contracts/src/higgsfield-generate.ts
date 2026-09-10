import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { AssetRecordSchema } from "./assets.js";

/** Fixture is the CI default. Live Higgsfield is optional behind MOS_HIGGSFIELD_SOURCE. */
export const HiggsfieldSourceModeSchema = z.enum(["fixture", "higgsfield_api"]);
export type HiggsfieldSourceMode = z.infer<typeof HiggsfieldSourceModeSchema>;

export const HiggsfieldGenerateJobStatusSchema = z.enum([
  "SKIPPED_NO_GAP",
  "GENERATED",
  "GUARDIAN_REJECTED",
  "READY_FOR_OWNER_REVIEW",
]);
export type HiggsfieldGenerateJobStatus = z.infer<
  typeof HiggsfieldGenerateJobStatusSchema
>;

export const StillAspectSchema = z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]);
export type StillAspect = z.infer<typeof StillAspectSchema>;

export const StillGapNeedSchema = z.object({
  usage_tag: z.string().min(1).optional(),
  aspect: StillAspectSchema.optional(),
  reason: z.string().min(1),
});
export type StillGapNeed = z.infer<typeof StillGapNeedSchema>;

export const StillGapReportSchema = z.object({
  has_gap: z.boolean(),
  needs: z.array(StillGapNeedSchema).default([]),
  reason: z.string().min(1),
  covered_usage_tags: z.array(z.string()).default([]),
  covered_aspects: z.array(StillAspectSchema).default([]),
});
export type StillGapReport = z.infer<typeof StillGapReportSchema>;

export const HiggsfieldLayoutBriefSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  needed_usage_tags: z.array(z.string().min(1)).default([]),
  needed_aspects: z.array(StillAspectSchema).default([]),
  campaign_id: z.string().uuid().optional(),
  pack_id: z.string().uuid().optional(),
});
export type HiggsfieldLayoutBrief = z.infer<typeof HiggsfieldLayoutBriefSchema>;

export const HiggsfieldPromptSchema = z.object({
  text: z.string().min(1),
  verified_fields: z.array(z.string().min(1)).default([]),
  unverified_fields: z.array(z.string().min(1)).default([]),
  forbidden_claims_note: z.string().min(1),
});
export type HiggsfieldPrompt = z.infer<typeof HiggsfieldPromptSchema>;

export const HiggsfieldOutputPointerSchema = z.object({
  media_id: z.string().min(1),
  storage_uri: z.string().min(1),
  preview_url: z.string().url().optional(),
  aspect: StillAspectSchema,
  usage_tag: z.string().min(1),
  model: z.string().min(1).optional(),
});
export type HiggsfieldOutputPointer = z.infer<typeof HiggsfieldOutputPointerSchema>;

export const HiggsfieldGuardianSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()).default([]),
  reviewed: z.array(z.string()).default([]),
});
export type HiggsfieldGuardian = z.infer<typeof HiggsfieldGuardianSchema>;

/**
 * Brand-scoped Higgsfield fill-gaps job.
 * Generates a still only when approved stills / brand-kit leave a coverage gap.
 * Outputs stay GENERATED / UNVERIFIED / DRAFT until a human approves them.
 */
export const HiggsfieldGenerateJobSchema = z.object({
  job_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  gap: StillGapReportSchema,
  layout_brief: HiggsfieldLayoutBriefSchema,
  prompt: HiggsfieldPromptSchema.optional(),
  source_asset_ids: z.array(z.string().uuid()).default([]),
  brand_kit_asset_ids: z.array(z.string().uuid()).default([]),
  status: HiggsfieldGenerateJobStatusSchema,
  source: HiggsfieldSourceModeSchema,
  output: HiggsfieldOutputPointerSchema.optional(),
  generated_asset_id: z.string().uuid().optional(),
  guardian: HiggsfieldGuardianSchema,
  knowledge_status: z.literal("UNVERIFIED").default("UNVERIFIED"),
  provenance: z.literal("GENERATED").default("GENERATED"),
  approval_status: z.literal("DRAFT").default("DRAFT"),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  message: z.string(),
});
export type HiggsfieldGenerateJob = z.infer<typeof HiggsfieldGenerateJobSchema>;

export const HiggsfieldGenerateJobSnapshotSchema = z.object({
  jobs: z.array(HiggsfieldGenerateJobSchema).default([]),
});
export type HiggsfieldGenerateJobSnapshot = z.infer<
  typeof HiggsfieldGenerateJobSnapshotSchema
>;

export const HiggsfieldGenerateJobListSchema = z.object({
  brand_id: BrandIdSchema,
  source: HiggsfieldSourceModeSchema,
  jobs: z.array(HiggsfieldGenerateJobSchema).default([]),
  gaps: StillGapReportSchema,
  approved_stills: z.array(AssetRecordSchema).default([]),
  brand_kit: z.array(AssetRecordSchema).default([]),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  message: z.string(),
});
export type HiggsfieldGenerateJobList = z.infer<
  typeof HiggsfieldGenerateJobListSchema
>;

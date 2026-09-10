import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { AssetRecordSchema } from "./assets.js";

/** Fixture is the CI default. Live Figma REST is optional behind MOS_FIGMA_SOURCE. */
export const FigmaSourceModeSchema = z.enum(["fixture", "figma_api"]);
export type FigmaSourceMode = z.infer<typeof FigmaSourceModeSchema>;

export const FigmaArrangeJobStatusSchema = z.enum([
  "ARRANGED",
  "GUARDIAN_REJECTED",
  "READY_FOR_OWNER_REVIEW",
]);
export type FigmaArrangeJobStatus = z.infer<typeof FigmaArrangeJobStatusSchema>;

export const FigmaLayoutBriefSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  template_hint: z.string().min(1).optional(),
  campaign_id: z.string().uuid().optional(),
  pack_id: z.string().uuid().optional(),
});
export type FigmaLayoutBrief = z.infer<typeof FigmaLayoutBriefSchema>;

export const FigmaOutputPointerSchema = z.object({
  file_key: z.string().min(1),
  file_url: z.string().url(),
  node_id: z.string().min(1),
  node_url: z.string().url(),
  template_id: z.string().min(1),
});
export type FigmaOutputPointer = z.infer<typeof FigmaOutputPointerSchema>;

export const FigmaArrangeGuardianSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()).default([]),
  reviewed: z.array(z.string()).default([]),
});
export type FigmaArrangeGuardian = z.infer<typeof FigmaArrangeGuardianSchema>;

/**
 * Brand-scoped Figma arrange job.
 * Outputs stay GENERATED / UNVERIFIED / DRAFT until a human approves them.
 */
export const FigmaArrangeJobSchema = z.object({
  job_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  source_asset_ids: z.array(z.string().uuid()).min(1),
  brand_kit_asset_ids: z.array(z.string().uuid()).default([]),
  layout_brief: FigmaLayoutBriefSchema,
  status: FigmaArrangeJobStatusSchema,
  source: FigmaSourceModeSchema,
  output: FigmaOutputPointerSchema,
  generated_asset_id: z.string().uuid(),
  guardian: FigmaArrangeGuardianSchema,
  knowledge_status: z.literal("UNVERIFIED").default("UNVERIFIED"),
  provenance: z.literal("GENERATED").default("GENERATED"),
  approval_status: z.literal("DRAFT").default("DRAFT"),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  message: z.string(),
});
export type FigmaArrangeJob = z.infer<typeof FigmaArrangeJobSchema>;

export const FigmaArrangeJobSnapshotSchema = z.object({
  jobs: z.array(FigmaArrangeJobSchema).default([]),
});
export type FigmaArrangeJobSnapshot = z.infer<typeof FigmaArrangeJobSnapshotSchema>;

export const FigmaArrangeJobListSchema = z.object({
  brand_id: BrandIdSchema,
  source: FigmaSourceModeSchema,
  jobs: z.array(FigmaArrangeJobSchema).default([]),
  approved_stills: z.array(AssetRecordSchema).default([]),
  brand_kit: z.array(AssetRecordSchema).default([]),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  message: z.string(),
});
export type FigmaArrangeJobList = z.infer<typeof FigmaArrangeJobListSchema>;

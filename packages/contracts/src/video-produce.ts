import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { AssetRecordSchema } from "./assets.js";

/**
 * Fixture is the CI default.
 * `capcut` / `adobe_premiere` are honest stubs: they emit the same export
 * package / project recipe. They do not control CapCut or Premiere desktop.
 */
export const VideoProducerSourceModeSchema = z.enum([
  "fixture",
  "capcut",
  "adobe_premiere",
]);
export type VideoProducerSourceMode = z.infer<
  typeof VideoProducerSourceModeSchema
>;

export const VideoProduceJobStatusSchema = z.enum([
  "PACKAGED",
  "GUARDIAN_REJECTED",
  "READY_FOR_OWNER_REVIEW",
]);
export type VideoProduceJobStatus = z.infer<typeof VideoProduceJobStatusSchema>;

export const VideoTargetFormatSchema = z.enum(["reel", "story", "feed"]);
export type VideoTargetFormat = z.infer<typeof VideoTargetFormatSchema>;

export const VideoBriefSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  target_format: VideoTargetFormatSchema,
  campaign_id: z.string().uuid().optional(),
  pack_id: z.string().uuid().optional(),
});
export type VideoBrief = z.infer<typeof VideoBriefSchema>;

export const VideoCaptionSchema = z.object({
  order: z.number().int().nonnegative(),
  text: z.string().min(1),
  source_field: z.string().min(1),
  knowledge_status: z.literal("VERIFIED"),
});
export type VideoCaption = z.infer<typeof VideoCaptionSchema>;

export const VideoTimelineClipSchema = z.object({
  order: z.number().int().nonnegative(),
  asset_id: z.string().uuid(),
  role: z.enum(["approved_still", "generated_still"]),
  duration_ms: z.number().int().positive(),
  storage_uri: z.string().min(1),
});
export type VideoTimelineClip = z.infer<typeof VideoTimelineClipSchema>;

export const VideoPackageAssetRefSchema = z.object({
  asset_id: z.string().uuid(),
  title: z.string().min(1),
  storage_uri: z.string().min(1),
  role: z.enum(["approved_still", "generated_still"]),
});
export type VideoPackageAssetRef = z.infer<typeof VideoPackageAssetRefSchema>;

/**
 * Export package / project recipe — not a rendered video, not a publish.
 * CapCut/Adobe stubs emit this same shape for human import or future automation.
 */
export const VideoExportPackageSchema = z.object({
  package_kind: z.literal("export_package"),
  recipe_id: z.string().min(1),
  storage_uri: z.string().min(1),
  target_format: VideoTargetFormatSchema,
  aspect: z.enum(["9:16", "1:1"]),
  duration_ms: z.number().int().positive(),
  timeline: z.array(VideoTimelineClipSchema).min(1),
  captions: z.array(VideoCaptionSchema).default([]),
  asset_list: z.array(VideoPackageAssetRefSchema).min(1),
  import_hint: z.string().min(1),
  adapter_label: z.string().min(1),
  rendered_video: z.literal(false).default(false),
  desktop_control: z.literal(false).default(false),
  published: z.literal(false).default(false),
});
export type VideoExportPackage = z.infer<typeof VideoExportPackageSchema>;

export const VideoProduceGuardianSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()).default([]),
  reviewed: z.array(z.string()).default([]),
});
export type VideoProduceGuardian = z.infer<typeof VideoProduceGuardianSchema>;

/**
 * Brand-scoped video produce job.
 * Outputs stay GENERATED / UNVERIFIED / DRAFT until a human approves them.
 * The catalog row is package metadata, not a rendered or published video.
 */
export const VideoProduceJobSchema = z.object({
  job_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  brief: VideoBriefSchema,
  approved_still_ids: z.array(z.string().uuid()).default([]),
  generated_asset_ids: z.array(z.string().uuid()).default([]),
  target_format: VideoTargetFormatSchema,
  status: VideoProduceJobStatusSchema,
  source: VideoProducerSourceModeSchema,
  output: VideoExportPackageSchema,
  generated_asset_id: z.string().uuid(),
  guardian: VideoProduceGuardianSchema,
  knowledge_status: z.literal("UNVERIFIED").default("UNVERIFIED"),
  provenance: z.literal("GENERATED").default("GENERATED"),
  approval_status: z.literal("DRAFT").default("DRAFT"),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  message: z.string(),
});
export type VideoProduceJob = z.infer<typeof VideoProduceJobSchema>;

export const VideoProduceJobSnapshotSchema = z.object({
  jobs: z.array(VideoProduceJobSchema).default([]),
});
export type VideoProduceJobSnapshot = z.infer<
  typeof VideoProduceJobSnapshotSchema
>;

export const VideoProduceJobListSchema = z.object({
  brand_id: BrandIdSchema,
  source: VideoProducerSourceModeSchema,
  jobs: z.array(VideoProduceJobSchema).default([]),
  approved_stills: z.array(AssetRecordSchema).default([]),
  generated_stills: z.array(AssetRecordSchema).default([]),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  message: z.string(),
});
export type VideoProduceJobList = z.infer<typeof VideoProduceJobListSchema>;

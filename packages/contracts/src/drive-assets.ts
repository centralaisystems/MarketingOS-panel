import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import {
  AssetRecordSchema,
  DriveFolderRoleSchema,
  REQUIRED_DRIVE_FOLDER_ROLES,
} from "./assets.js";

export const DriveSourceModeSchema = z.enum(["fixture", "google_drive"]);
export type DriveSourceMode = z.infer<typeof DriveSourceModeSchema>;

export const DriveListedFileSchema = z.object({
  drive_file_id: z.string().min(1),
  name: z.string().min(1),
  mime_type: z.string().min(1),
  path: z.string().min(1),
  folder_role: DriveFolderRoleSchema,
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  drive_md5: z.string().min(1).optional(),
  modified_at: z.string().datetime().optional(),
});
export type DriveListedFile = z.infer<typeof DriveListedFileSchema>;

export const DriveFolderContractSchema = z.object({
  valid: z.boolean(),
  required: z.array(DriveFolderRoleSchema).default([...REQUIRED_DRIVE_FOLDER_ROLES]),
  present: z.array(DriveFolderRoleSchema).default([]),
  missing: z.array(DriveFolderRoleSchema).default([]),
  unknown: z.array(z.string()).default([]),
});
export type DriveFolderContract = z.infer<typeof DriveFolderContractSchema>;

export const DriveAssetSyncResultSchema = z.object({
  brand_id: BrandIdSchema,
  configured: z.boolean(),
  read_only: z.literal(true).default(true),
  source: DriveSourceModeSchema,
  folder_id: z.string().nullable(),
  folder_url: z.string().nullable(),
  contract: DriveFolderContractSchema,
  ingested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  assets: z.array(AssetRecordSchema).default([]),
  synced_at: z.string().datetime(),
  message: z.string(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  stores_binaries_in_git: z.literal(false).default(false),
});
export type DriveAssetSyncResult = z.infer<typeof DriveAssetSyncResultSchema>;

export const DriveSyncStatusSchema = z.object({
  brand_id: BrandIdSchema,
  configured: z.boolean(),
  read_only: z.literal(true).default(true),
  source: DriveSourceModeSchema,
  folder_id: z.string().nullable(),
  folder_url: z.string().nullable(),
  contract: DriveFolderContractSchema,
  ingested_count: z.number().int().nonnegative(),
  assets: z.array(AssetRecordSchema).default([]),
  last_synced_at: z.string().datetime().nullable(),
  live_publish: z.literal(false).default(false),
  live_ads: z.literal(false).default(false),
  stores_binaries_in_git: z.literal(false).default(false),
  message: z.string(),
});
export type DriveSyncStatus = z.infer<typeof DriveSyncStatusSchema>;

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { KnowledgeStatusSchema } from "./evidence.js";

/** Wave 4 asset kinds — metadata only; binaries stay out of Git. */
export const AssetKindSchema = z.enum([
  "IMAGE",
  "VIDEO",
  "DOCUMENT",
  "AUDIO",
  "OTHER",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetApprovalStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "ARCHIVED",
]);
export type AssetApprovalStatus = z.infer<typeof AssetApprovalStatusSchema>;

const EXTERNAL_STORAGE_URI =
  /^(mos|s3|gs|https):\/\//i;

export function assertExternalStorageUri(uri: string): string {
  if (!EXTERNAL_STORAGE_URI.test(uri)) {
    throw new Error(
      "Asset binaries must live in object storage (mos://, s3://, gs://, or https://), not Git",
    );
  }
  return uri;
}

export const AssetStorageUriSchema = z
  .string()
  .min(1)
  .refine((uri) => EXTERNAL_STORAGE_URI.test(uri), {
    message:
      "Asset binaries must live in object storage (mos://, s3://, gs://, or https://), not Git",
  });

export const AssetRecordSchema = z.object({
  asset_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  title: z.string().min(1),
  kind: AssetKindSchema,
  mime_type: z.string().min(1),
  storage_uri: AssetStorageUriSchema,
  /** Fail-closed: metadata catalog never claims a Git binary. */
  in_git: z.literal(false).default(false),
  checksum_sha256: z.string().optional(),
  usage_tags: z.array(z.string().min(1)).default([]),
  platform_suitability: z.array(z.string().min(1)).default([]),
  approval_status: AssetApprovalStatusSchema,
  knowledge_status: KnowledgeStatusSchema.default("UNVERIFIED"),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const AssetUsageRecordSchema = z.object({
  usage_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  asset_id: z.string().uuid(),
  used_at: z.string().datetime(),
  channel: z.string().optional(),
  campaign_id: z.string().uuid().optional(),
  note: z.string().optional(),
});
export type AssetUsageRecord = z.infer<typeof AssetUsageRecordSchema>;

export const AssetStoragePointerSchema = z.object({
  brand_id: BrandIdSchema,
  asset_id: z.string().uuid(),
  storage_uri: AssetStorageUriSchema,
  in_git: z.literal(false),
  stores_binaries_in_git: z.literal(false),
});
export type AssetStoragePointer = z.infer<typeof AssetStoragePointerSchema>;

export const AssetCatalogSnapshotSchema = z.object({
  assets: z.array(AssetRecordSchema).default([]),
  usage: z.array(AssetUsageRecordSchema).default([]),
});
export type AssetCatalogSnapshot = z.infer<typeof AssetCatalogSnapshotSchema>;

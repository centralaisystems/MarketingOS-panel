import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { SourceTypeSchema, ConfidenceSchema } from "./evidence.js";

/**
 * Explicit cross-brand relationships.
 * Recording a relationship MUST NOT merge brand knowledge or memory.
 */
export const BrandRelationshipTypeSchema = z.enum([
  "RELATED_COMPANY",
  "SERVICE_PROVIDER",
  "PROJECT_COLLABORATION",
  "CONTENT_COLLABORATION",
  "REFERRAL",
  "SHARED_ASSET_WITH_PERMISSION",
]);
export type BrandRelationshipType = z.infer<typeof BrandRelationshipTypeSchema>;

export const BrandRelationshipSchema = z.object({
  relationship_id: z.string().min(1),
  from_brand_id: BrandIdSchema,
  to_brand_id: BrandIdSchema,
  type: BrandRelationshipTypeSchema,
  description: z.string().min(1),
  usage_permission: z.boolean().default(false),
  source_type: SourceTypeSchema,
  source_reference: z.string().min(1),
  confidence: ConfidenceSchema,
  status: z.enum(["UNVERIFIED", "VERIFIED", "REVOKED"]).default("UNVERIFIED"),
  created_at: z.string().datetime(),
});
export type BrandRelationship = z.infer<typeof BrandRelationshipSchema>;

export const BrandRelationshipRegistrySchema = z.object({
  updated_at: z.string().datetime(),
  relationships: z.array(BrandRelationshipSchema).default([]),
});
export type BrandRelationshipRegistry = z.infer<
  typeof BrandRelationshipRegistrySchema
>;

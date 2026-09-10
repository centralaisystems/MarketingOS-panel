import { z } from "zod";

/**
 * Brand id format — SCREAMING_SNAKE.
 * Membership in the live set is enforced via brands/_shared/REGISTRY.json at runtime.
 */
export const BrandIdSchema = z
  .string()
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "brand_id must be SCREAMING_SNAKE (A-Z, digits, underscore)",
  );
export type BrandId = z.infer<typeof BrandIdSchema>;

export const BrandRegistryEntrySchema = z.object({
  brand_id: BrandIdSchema,
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug must be lowercase kebab-case",
    ),
  display_name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  default_locales: z.array(z.string().min(1)).default(["en"]),
  created_at: z.string().datetime().optional(),
});
export type BrandRegistryEntry = z.infer<typeof BrandRegistryEntrySchema>;

export const BrandRegistrySchema = z.object({
  updated_at: z.string().datetime(),
  brands: z.array(BrandRegistryEntrySchema).min(1),
});
export type BrandRegistry = z.infer<typeof BrandRegistrySchema>;

export const AgentIdSchema = z.enum([
  "A01_MARKETING_DIRECTOR",
  "A02_BRAND_STRATEGIST",
  "A03_RESEARCH_INTELLIGENCE",
  "A04_COMPETITOR_INTELLIGENCE",
  "A05_CONTENT_COPY",
  "A06_SOCIAL_MANAGER",
  "A07_CREATIVE_DIRECTOR",
  "A08_VIDEO_REELS",
  "A09_SEO",
  "A10_PAID_GROWTH",
  "A11_WEBSITE_CRO",
  "A12_CRM_LEAD_INTELLIGENCE",
  "A13_ANALYTICS_OPS",
  "A14_BRAND_GUARDIAN",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const TaskIdSchema = z.string().uuid();
export type TaskId = z.infer<typeof TaskIdSchema>;

export const CampaignIdSchema = z.string().uuid();
export type CampaignId = z.infer<typeof CampaignIdSchema>;

export const ApprovalIdSchema = z.string().uuid();
export type ApprovalId = z.infer<typeof ApprovalIdSchema>;

export const OperatorIdSchema = z.string().min(1);
export type OperatorId = z.infer<typeof OperatorIdSchema>;

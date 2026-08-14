import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { KnowledgeStatusSchema } from "./evidence.js";

/** Typed knowledge field — value optional when MISSING. */
export const KnowledgeFieldSchema = z.object({
  status: KnowledgeStatusSchema,
  value: z.unknown().optional(),
  notes: z.string().optional(),
  last_verified_at: z.string().datetime().optional(),
});
export type KnowledgeField = z.infer<typeof KnowledgeFieldSchema>;

export function missingField(notes?: string): z.infer<typeof KnowledgeFieldSchema> {
  return notes
    ? { status: "MISSING", notes }
    : { status: "MISSING" };
}

export function unverifiedField(
  value: unknown,
  notes?: string,
): z.infer<typeof KnowledgeFieldSchema> {
  return notes
    ? { status: "UNVERIFIED", value, notes }
    : { status: "UNVERIFIED", value };
}

export function verifiedField(
  value: unknown,
  last_verified_at?: string,
): z.infer<typeof KnowledgeFieldSchema> {
  return last_verified_at
    ? { status: "VERIFIED", value, last_verified_at }
    : { status: "VERIFIED", value };
}

export const BrandProfileSchema = z.object({
  brand_id: BrandIdSchema,
  slug: z.string().min(1),
  display_name: z.string().min(1),
  identity: KnowledgeFieldSchema,
  positioning: KnowledgeFieldSchema,
  products_services: KnowledgeFieldSchema,
  audiences: KnowledgeFieldSchema,
  personas: KnowledgeFieldSchema,
  markets: KnowledgeFieldSchema,
  competitors: KnowledgeFieldSchema,
  tone: KnowledgeFieldSchema,
  visual_guidelines: KnowledgeFieldSchema,
  content_pillars: KnowledgeFieldSchema,
  channels: KnowledgeFieldSchema,
  seo: KnowledgeFieldSchema,
  paid_media: KnowledgeFieldSchema,
  cta_library: KnowledgeFieldSchema,
  claims_restrictions: KnowledgeFieldSchema,
  historical_learnings: KnowledgeFieldSchema,
  default_locales: z.array(z.string()).default(["en"]),
  updated_at: z.string().datetime(),
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const BRAND_KNOWLEDGE_KEYS = [
  "identity",
  "positioning",
  "products_services",
  "audiences",
  "personas",
  "markets",
  "competitors",
  "tone",
  "visual_guidelines",
  "content_pillars",
  "channels",
  "seo",
  "paid_media",
  "cta_library",
  "claims_restrictions",
  "historical_learnings",
] as const;

export type BrandKnowledgeKey = (typeof BRAND_KNOWLEDGE_KEYS)[number];

export function listMissingKnowledge(profile: BrandProfile): BrandKnowledgeKey[] {
  return BRAND_KNOWLEDGE_KEYS.filter((key) => profile[key].status === "MISSING");
}

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";

/**
 * Knowledge field verification status.
 * MISSING = no value; do not invent.
 * UNVERIFIED = present but not human-confirmed.
 * VERIFIED = confirmed brand fact with acceptable provenance.
 * CONFLICTING = sources disagree; do not silently pick a winner.
 * STALE = was verified/observed but past review window for time-sensitive facts.
 */
export const KnowledgeStatusSchema = z.enum([
  "MISSING",
  "UNVERIFIED",
  "VERIFIED",
  "CONFLICTING",
  "STALE",
]);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

/**
 * Provenance source types.
 * AI_INFERENCE must never equal VERIFIED without supporting evidence.
 */
export const SourceTypeSchema = z.enum([
  "INTERNAL_DOCUMENT",
  "INTERNAL_OPERATOR",
  "OFFICIAL_WEBSITE",
  "OFFICIAL_SOCIAL",
  "PUBLIC_SOURCE",
  "ANALYTICS",
  "CRM",
  "AI_INFERENCE",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Hierarchy for conflict resolution guidance (higher = more authoritative). Does not auto-overwrite. */
export const SOURCE_TYPE_AUTHORITY: Record<SourceType, number> = {
  INTERNAL_OPERATOR: 100,
  INTERNAL_DOCUMENT: 90,
  OFFICIAL_WEBSITE: 70,
  OFFICIAL_SOCIAL: 60,
  CRM: 55,
  ANALYTICS: 50,
  PUBLIC_SOURCE: 30,
  AI_INFERENCE: 0,
};

export const ConfidenceSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERIFIED",
]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Statement classification — agents must label claims. */
export const ClaimKindSchema = z.enum([
  "FACT",
  "ASSUMPTION",
  "OBSERVATION",
  "RECOMMENDATION",
]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const SourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  retrieved_at: z.string().datetime().optional(),
  publisher: z.string().optional(),
  note: z.string().optional(),
  source_type: SourceTypeSchema.optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  kind: ClaimKindSchema,
  confidence: ConfidenceSchema,
  sources: z.array(SourceSchema).default([]),
  brand_id: BrandIdSchema.optional(),
  collected_at: z.string().datetime().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const StatementSchema = z.object({
  text: z.string().min(1),
  kind: ClaimKindSchema,
  confidence: ConfidenceSchema,
  evidence_ids: z.array(z.string()).default([]),
});
export type Statement = z.infer<typeof StatementSchema>;

/** Acceptable provenance for VERIFIED status (AI_INFERENCE alone is never enough). */
export const VERIFIED_ALLOWED_SOURCE_TYPES: readonly SourceType[] = [
  "INTERNAL_DOCUMENT",
  "INTERNAL_OPERATOR",
  "OFFICIAL_WEBSITE",
  "OFFICIAL_SOCIAL",
  "PUBLIC_SOURCE",
  "ANALYTICS",
  "CRM",
] as const;

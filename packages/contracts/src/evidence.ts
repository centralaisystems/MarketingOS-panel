import { z } from "zod";

/**
 * Knowledge field verification status.
 * MISSING = no value; do not invent.
 * UNVERIFIED = present but not human-confirmed.
 * VERIFIED = confirmed brand fact.
 */
export const KnowledgeStatusSchema = z.enum([
  "MISSING",
  "UNVERIFIED",
  "VERIFIED",
]);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

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
});
export type Source = z.infer<typeof SourceSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  kind: ClaimKindSchema,
  confidence: ConfidenceSchema,
  sources: z.array(SourceSchema).default([]),
  brand_id: z
    .enum(["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"])
    .optional(),
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

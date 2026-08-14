import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { SourceTypeSchema } from "./evidence.js";

/**
 * Safe ingestion envelope — connectors deferred.
 * Adapters for website/PDF/Drive/social/CRM/analytics are interfaces only.
 */
export const IngestionFormatSchema = z.enum([
  "MARKDOWN",
  "YAML",
  "JSON",
  "TEXT",
  "STRUCTURED_OPERATOR",
]);
export type IngestionFormat = z.infer<typeof IngestionFormatSchema>;

export const FutureConnectorKindSchema = z.enum([
  "WEBSITE",
  "PDF",
  "GOOGLE_DRIVE",
  "SOCIAL_ACCOUNT",
  "CRM",
  "ANALYTICS",
]);
export type FutureConnectorKind = z.infer<typeof FutureConnectorKindSchema>;

export const IngestionEnvelopeSchema = z.object({
  ingestion_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  format: IngestionFormatSchema,
  source_type: SourceTypeSchema,
  source_reference: z.string().min(1),
  observed_at: z.string().datetime(),
  content: z.string().min(1),
  content_sha256: z.string().optional(),
  future_connector: FutureConnectorKindSchema.optional(),
  /** Connectors are not wired in Phase 2. */
  connector_connected: z.literal(false).default(false),
});
export type IngestionEnvelope = z.infer<typeof IngestionEnvelopeSchema>;

export const NormalizedFactCandidateSchema = z.object({
  path: z.string().min(1),
  value: z.unknown(),
  source_type: SourceTypeSchema,
  source_reference: z.string().min(1),
  observed_at: z.string().datetime(),
  brand_id: BrandIdSchema,
  ingestion_id: z.string().uuid(),
});
export type NormalizedFactCandidate = z.infer<
  typeof NormalizedFactCandidateSchema
>;

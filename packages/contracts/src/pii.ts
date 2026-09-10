import { z } from "zod";

/**
 * Data classification for future lead/contact handling.
 * Phase 1: do not store real lead data.
 * PII must never casually enter prompts, logs, or global memory.
 */
export const DataClassificationSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "PII",
]);
export type DataClassification = z.infer<typeof DataClassificationSchema>;

export const PII_HANDLING_POLICY = {
  phase: 1,
  store_real_leads: false,
  allow_pii_in_prompts: false,
  allow_pii_in_logs: false,
  allow_pii_in_global_memory: false,
  allow_pii_in_brand_memory: false,
  redaction_required_before_export: true,
  opaque_pii_ref_required: true,
  classifications_blocked_from_model_context: ["PII", "CONFIDENTIAL"] as const,
} as const;

export const ClassifiedFieldSchema = z.object({
  name: z.string().min(1),
  classification: DataClassificationSchema,
  value_present: z.boolean().default(false),
  /** Never put actual PII values in contracts/fixtures. */
  redacted_placeholder: z.string().optional(),
});
export type ClassifiedField = z.infer<typeof ClassifiedFieldSchema>;

import { z } from "zod";
import {
  ConfidenceSchema,
  KnowledgeStatusSchema,
  SourceTypeSchema,
  VERIFIED_ALLOWED_SOURCE_TYPES,
  type KnowledgeStatus,
  type SourceType,
} from "./evidence.js";

/**
 * Provenanced knowledge field — Phase 2 brand intelligence unit of truth.
 * Never silently promote ASSUMPTION / AI_INFERENCE to VERIFIED.
 */
export const ProvenancedFieldSchema = z
  .object({
    status: KnowledgeStatusSchema,
    value: z.unknown().optional(),
    notes: z.string().optional(),
    source_type: SourceTypeSchema.optional(),
    source_reference: z.string().optional(),
    observed_at: z.string().datetime().optional(),
    verified_at: z.string().datetime().optional(),
    confidence: ConfidenceSchema.optional(),
    /** Days after observed_at/verified_at when time-sensitive facts become STALE. */
    review_after_days: z.number().int().positive().optional(),
    time_sensitive: z.boolean().default(false),
    conflict_values: z
      .array(
        z.object({
          value: z.unknown(),
          source_type: SourceTypeSchema,
          source_reference: z.string().min(1),
          observed_at: z.string().datetime().optional(),
        }),
      )
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (field.status === "VERIFIED") {
      if (field.value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VERIFIED fields require a value",
        });
      }
      if (!field.source_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VERIFIED fields require source_type",
        });
      } else if (
        !(VERIFIED_ALLOWED_SOURCE_TYPES as readonly string[]).includes(
          field.source_type,
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `VERIFIED cannot use source_type ${field.source_type}`,
        });
      }
      if (field.source_type === "AI_INFERENCE") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI_INFERENCE alone cannot be VERIFIED",
        });
      }
      if (!field.source_reference) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VERIFIED fields require source_reference",
        });
      }
    }
    if (field.status === "CONFLICTING") {
      if (!field.conflict_values || field.conflict_values.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CONFLICTING fields require at least two conflict_values",
        });
      }
    }
    if (field.status === "MISSING" && field.value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MISSING fields must not carry a value",
      });
    }
  });
export type ProvenancedField = z.infer<typeof ProvenancedFieldSchema>;

export function missingProvenance(notes?: string): ProvenancedField {
  return ProvenancedFieldSchema.parse(
    notes ? { status: "MISSING", notes } : { status: "MISSING" },
  );
}

export function unverifiedProvenance(
  value: unknown,
  opts?: {
    notes?: string;
    source_type?: SourceType;
    source_reference?: string;
    confidence?: ProvenancedField["confidence"];
    time_sensitive?: boolean;
    review_after_days?: number;
    observed_at?: string;
  },
): ProvenancedField {
  return ProvenancedFieldSchema.parse({
    status: "UNVERIFIED",
    value,
    notes: opts?.notes,
    source_type: opts?.source_type ?? "AI_INFERENCE",
    source_reference: opts?.source_reference ?? "orientation_brief",
    confidence: opts?.confidence ?? "LOW",
    time_sensitive: opts?.time_sensitive ?? false,
    review_after_days: opts?.review_after_days,
    observed_at: opts?.observed_at ?? new Date().toISOString(),
  });
}

export function isStaleField(
  field: ProvenancedField,
  now: Date = new Date(),
): boolean {
  if (field.status === "STALE") return true;
  if (!field.time_sensitive || !field.review_after_days) return false;
  const anchor = field.verified_at ?? field.observed_at;
  if (!anchor) return false;
  const start = new Date(anchor).getTime();
  const ms = field.review_after_days * 24 * 60 * 60 * 1000;
  return now.getTime() > start + ms;
}

export function assertNotAiVerified(
  status: KnowledgeStatus,
  source_type: SourceType | undefined,
): boolean {
  return !(status === "VERIFIED" && source_type === "AI_INFERENCE");
}

import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { KnowledgeStatusSchema } from "./evidence.js";
import { UtmParamsSchema } from "./utm.js";

/** Read-only reporting providers for Wave 4. No write/launch scopes. */
export const AnalyticsProviderSchema = z.enum(["GA4", "GSC", "SOCIAL", "ADS"]);
export type AnalyticsProvider = z.infer<typeof AnalyticsProviderSchema>;

export const AnalyticsModeSchema = z.enum(["FIXTURE", "STUB"]);
export type AnalyticsMode = z.infer<typeof AnalyticsModeSchema>;

/** Fixture/stub metrics may be MISSING or UNVERIFIED — never VERIFIED traffic. */
export const AnalyticsKnowledgeStatusSchema = KnowledgeStatusSchema.extract([
  "MISSING",
  "UNVERIFIED",
]);
export type AnalyticsKnowledgeStatus = z.infer<
  typeof AnalyticsKnowledgeStatusSchema
>;

export const EmptyWriteScopesSchema = z.tuple([]);
export type EmptyWriteScopes = z.infer<typeof EmptyWriteScopesSchema>;

export const AnalyticsMetricRowSchema = z.object({
  brand_id: BrandIdSchema,
  provider: AnalyticsProviderSchema,
  metric_key: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  knowledge_status: AnalyticsKnowledgeStatusSchema,
  utm: UtmParamsSchema.optional(),
  utm_valid: z.boolean(),
  utm_issues: z.array(z.string()).default([]),
});
export type AnalyticsMetricRow = z.infer<typeof AnalyticsMetricRowSchema>;

export const AnalyticsProviderReportSchema = z.object({
  provider: AnalyticsProviderSchema,
  mode: AnalyticsModeSchema,
  write_scopes: EmptyWriteScopesSchema,
  connected: z.literal(false),
  rows: z.array(AnalyticsMetricRowSchema).default([]),
});
export type AnalyticsProviderReport = z.infer<
  typeof AnalyticsProviderReportSchema
>;

export const AnalyticsUtmHealthSchema = z.object({
  rows_with_valid_utm: z.number().int().nonnegative(),
  rows_missing_or_invalid_utm: z.number().int().nonnegative(),
  issues: z.array(z.string()).default([]),
});
export type AnalyticsUtmHealth = z.infer<typeof AnalyticsUtmHealthSchema>;

export const AnalyticsSnapshotSchema = z.object({
  brand_id: BrandIdSchema,
  generated_at: z.string().datetime(),
  status: AnalyticsModeSchema,
  write_scopes: EmptyWriteScopesSchema,
  live_keys_used: z.literal(false),
  providers: z.array(AnalyticsProviderReportSchema),
  utm_health: AnalyticsUtmHealthSchema,
  notes: z.array(z.string()).default([]),
});
export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

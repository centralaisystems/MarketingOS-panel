import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { UtmChannelSchema, UtmMediumSchema } from "./utm.js";
import { ClassifiedFieldSchema } from "./pii.js";

export const LeadSourceSchema = z.enum(["FORM", "WHATSAPP", "MANUAL", "OTHER"]);
export type LeadSource = z.infer<typeof LeadSourceSchema>;

export const LeadStageSchema = z.enum([
  "NEW",
  "QUALIFIED",
  "OPPORTUNITY",
  "WON",
  "LOST",
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

export const OpportunityStageSchema = z.enum(["OPEN", "WON", "LOST"]);
export type OpportunityStage = z.infer<typeof OpportunityStageSchema>;

export const LeadEventKindSchema = z.enum([
  "INGESTED",
  "ATTRIBUTED",
  "STAGE_CHANGED",
  "NOTE",
]);
export type LeadEventKind = z.infer<typeof LeadEventKindSchema>;

export const CrmAdapterIdSchema = z.enum(["form_stub", "whatsapp_stub"]);
export type CrmAdapterId = z.infer<typeof CrmAdapterIdSchema>;

/**
 * UTM / campaign attribution on a lead. No contact fields.
 * `brand_id` lives on the parent Lead / LeadEvent, not here.
 */
export const LeadUtmSchema = z.object({
  utm_source: z.string().min(1).optional(),
  utm_medium: UtmMediumSchema.optional(),
  utm_campaign: z.string().min(1).optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  channel: UtmChannelSchema.optional(),
});
export type LeadUtm = z.infer<typeof LeadUtmSchema>;

export const LeadSchema = z.object({
  lead_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  /** Opaque vault handle — never raw email/phone. */
  pii_ref: z.string().min(1),
  source: LeadSourceSchema,
  campaign_id: z.string().uuid().optional(),
  utm: LeadUtmSchema.optional(),
  stage: LeadStageSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;

/** Backward-compatible alias used by the Wave 7 scaffold. */
export const LeadRecordSchema = LeadSchema;
export type LeadRecord = Lead;

export const LeadEventSchema = z.object({
  event_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  lead_id: z.string().uuid(),
  pii_ref: z.string().min(1),
  kind: LeadEventKindSchema,
  source: LeadSourceSchema.optional(),
  campaign_id: z.string().uuid().optional(),
  utm: LeadUtmSchema.optional(),
  /** Operator/agent-safe note. Must not contain raw PII. */
  message: z.string().min(1).optional(),
  created_at: z.string().datetime(),
});
export type LeadEvent = z.infer<typeof LeadEventSchema>;

export const OpportunitySchema = z.object({
  opportunity_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  lead_id: z.string().uuid(),
  pii_ref: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
  stage: OpportunityStageSchema,
  created_at: z.string().datetime(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

/** Campaign join row for the panel. Agent-safe — pii_ref only. */
export const LeadAttributionRowSchema = z.object({
  brand_id: BrandIdSchema,
  lead_id: z.string().uuid(),
  pii_ref: z.string().min(1),
  source: LeadSourceSchema,
  stage: LeadStageSchema,
  campaign_id: z.string().uuid().optional(),
  campaign_objective: z.string().optional(),
  utm: LeadUtmSchema.optional(),
  attributed: z.boolean(),
});
export type LeadAttributionRow = z.infer<typeof LeadAttributionRowSchema>;

export const CampaignAttributionSummarySchema = z.object({
  brand_id: BrandIdSchema,
  campaign_id: z.string().uuid(),
  objective: z.string().min(1),
  lead_count: z.number().int().nonnegative(),
  sources: z.array(LeadSourceSchema).default([]),
});
export type CampaignAttributionSummary = z.infer<
  typeof CampaignAttributionSummarySchema
>;

/**
 * Shape agents may receive. No email, phone, name, or WhatsApp id.
 */
export const AgentLeadSummarySchema = z.object({
  brand_id: BrandIdSchema,
  lead_id: z.string().uuid(),
  pii_ref: z.string().min(1),
  source: LeadSourceSchema,
  stage: LeadStageSchema,
  campaign_id: z.string().uuid().optional(),
  utm_campaign: z.string().optional(),
  attributed: z.boolean(),
  classified_fields: z.array(ClassifiedFieldSchema).default([]),
});
export type AgentLeadSummary = z.infer<typeof AgentLeadSummarySchema>;

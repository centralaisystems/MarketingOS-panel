import { z } from "zod";
import { BrandIdSchema } from "./ids.js";
import { LanguageCodeSchema } from "./localization.js";
import { ProvenancedFieldSchema } from "./provenance.js";
import { ConfidenceSchema, SourceTypeSchema } from "./evidence.js";

export const BrandModuleMetaSchema = z.object({
  brand_id: BrandIdSchema,
  module: z.string().min(1),
  updated_at: z.string().datetime(),
});

export const IdentityModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("identity"),
  official_name: ProvenancedFieldSchema,
  short_name: ProvenancedFieldSchema,
  legal_operating_relationship: ProvenancedFieldSchema,
  description: ProvenancedFieldSchema,
  location_markets: ProvenancedFieldSchema,
  website: ProvenancedFieldSchema,
  contact_channels: ProvenancedFieldSchema,
  languages: ProvenancedFieldSchema,
});
export type IdentityModule = z.infer<typeof IdentityModuleSchema>;

export const PositioningModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("positioning"),
  category: ProvenancedFieldSchema,
  positioning_statement: ProvenancedFieldSchema,
  differentiation: ProvenancedFieldSchema,
  value_proposition: ProvenancedFieldSchema,
  desired_perception: ProvenancedFieldSchema,
  market_level: ProvenancedFieldSchema,
  geographic_positioning: ProvenancedFieldSchema,
  /** Orientation only — not a verified fact. */
  marketing_direction_note: z.string().optional(),
});
export type PositioningModule = z.infer<typeof PositioningModuleSchema>;

export const OfferingItemSchema = z.object({
  id: z.string().min(1),
  name: ProvenancedFieldSchema,
  category: ProvenancedFieldSchema,
  description: ProvenancedFieldSchema,
  audience: ProvenancedFieldSchema,
  geography: ProvenancedFieldSchema,
  pricing: ProvenancedFieldSchema,
  cta: ProvenancedFieldSchema,
});
export type OfferingItem = z.infer<typeof OfferingItemSchema>;

export const OfferingsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("offerings"),
  items: z.array(OfferingItemSchema).default([]),
});
export type OfferingsModule = z.infer<typeof OfferingsModuleSchema>;

export const AudienceSegmentSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["PRIMARY", "SECONDARY"]),
  label: ProvenancedFieldSchema,
  geography: ProvenancedFieldSchema,
  needs: ProvenancedFieldSchema,
  pain_points: ProvenancedFieldSchema,
  motivations: ProvenancedFieldSchema,
  objections: ProvenancedFieldSchema,
  buying_triggers: ProvenancedFieldSchema,
  preferred_channels: ProvenancedFieldSchema,
});
export type AudienceSegment = z.infer<typeof AudienceSegmentSchema>;

export const AudiencesModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("audiences"),
  segments: z.array(AudienceSegmentSchema).default([]),
  /** Personas only when verified — do not fabricate. */
  personas: ProvenancedFieldSchema,
});
export type AudiencesModule = z.infer<typeof AudiencesModuleSchema>;

export const VoiceModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("voice"),
  personality: ProvenancedFieldSchema,
  tone: ProvenancedFieldSchema,
  vocabulary: ProvenancedFieldSchema,
  preferred_terminology: ProvenancedFieldSchema,
  prohibited_terminology: ProvenancedFieldSchema,
  writing_examples: ProvenancedFieldSchema,
  cta_style: ProvenancedFieldSchema,
  language_differences: ProvenancedFieldSchema,
  locale_guidance: z
    .array(
      z.object({
        language: LanguageCodeSchema,
        notes: ProvenancedFieldSchema,
      }),
    )
    .default([]),
});
export type VoiceModule = z.infer<typeof VoiceModuleSchema>;

export const VisualModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("visual"),
  logo: ProvenancedFieldSchema,
  colors: ProvenancedFieldSchema,
  typography: ProvenancedFieldSchema,
  imagery: ProvenancedFieldSchema,
  photography: ProvenancedFieldSchema,
  graphic_style: ProvenancedFieldSchema,
  layout_characteristics: ProvenancedFieldSchema,
  prohibited_treatments: ProvenancedFieldSchema,
});
export type VisualModule = z.infer<typeof VisualModuleSchema>;

export const ContentPillarSchema = z.object({
  id: z.string().min(1),
  name: ProvenancedFieldSchema,
  objective: ProvenancedFieldSchema,
  audience: ProvenancedFieldSchema,
  topics: ProvenancedFieldSchema,
  formats: ProvenancedFieldSchema,
  channels: ProvenancedFieldSchema,
  cta: ProvenancedFieldSchema,
  rationale: ProvenancedFieldSchema,
});
export type ContentPillar = z.infer<typeof ContentPillarSchema>;

export const ContentPillarsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("content_pillars"),
  pillars: z.array(ContentPillarSchema).default([]),
});
export type ContentPillarsModule = z.infer<typeof ContentPillarsModuleSchema>;

export const ChannelEntrySchema = z.object({
  id: z.string().min(1),
  platform: ProvenancedFieldSchema,
  status: ProvenancedFieldSchema,
  purpose: ProvenancedFieldSchema,
  audience: ProvenancedFieldSchema,
  content_types: ProvenancedFieldSchema,
  priority: ProvenancedFieldSchema,
  url_or_handle: ProvenancedFieldSchema,
  kpi_intent: ProvenancedFieldSchema,
});
export type ChannelEntry = z.infer<typeof ChannelEntrySchema>;

export const ChannelsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("channels"),
  channels: z.array(ChannelEntrySchema).default([]),
});
export type ChannelsModule = z.infer<typeof ChannelsModuleSchema>;

export const ClaimsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("claims"),
  approved_claims: ProvenancedFieldSchema,
  claims_requiring_evidence: ProvenancedFieldSchema,
  prohibited_claims: ProvenancedFieldSchema,
  regulatory_considerations: ProvenancedFieldSchema,
  pricing_restrictions: ProvenancedFieldSchema,
  investment_financial_restrictions: ProvenancedFieldSchema,
  client_confidentiality_restrictions: ProvenancedFieldSchema,
});
export type ClaimsModule = z.infer<typeof ClaimsModuleSchema>;

export const CtaEntrySchema = z.object({
  id: z.string().min(1),
  label: ProvenancedFieldSchema,
  intent: ProvenancedFieldSchema,
  brand_appropriate: z.boolean().default(true),
});
export type CtaEntry = z.infer<typeof CtaEntrySchema>;

export const CtaModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("cta"),
  items: z.array(CtaEntrySchema).default([]),
});
export type CtaModule = z.infer<typeof CtaModuleSchema>;

export const CompetitorEntrySchema = z.object({
  id: z.string().min(1),
  name: ProvenancedFieldSchema,
  category: ProvenancedFieldSchema,
  geography: ProvenancedFieldSchema,
  why_relevant: ProvenancedFieldSchema,
  source_type: SourceTypeSchema.optional(),
  source_reference: z.string().optional(),
  confidence: ConfidenceSchema.optional(),
});
export type CompetitorEntry = z.infer<typeof CompetitorEntrySchema>;

export const CompetitorsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("competitors"),
  competitors: z.array(CompetitorEntrySchema).default([]),
});
export type CompetitorsModule = z.infer<typeof CompetitorsModuleSchema>;

export const LearningEntrySchema = z.object({
  id: z.string().min(1),
  observation: ProvenancedFieldSchema,
});
export type LearningEntry = z.infer<typeof LearningEntrySchema>;

export const LearningsModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("learnings"),
  items: z.array(LearningEntrySchema).default([]),
});
export type LearningsModule = z.infer<typeof LearningsModuleSchema>;

export const SourceRegistryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source_type: SourceTypeSchema,
  reference: z.string().min(1),
  url: z.string().url().optional(),
  observed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
});
export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntrySchema>;

export const SourcesModuleSchema = BrandModuleMetaSchema.extend({
  module: z.literal("sources"),
  sources: z.array(SourceRegistryEntrySchema).default([]),
});
export type SourcesModule = z.infer<typeof SourcesModuleSchema>;

export const BRAND_PACK_FILES = [
  "IDENTITY.json",
  "POSITIONING.json",
  "OFFERINGS.json",
  "AUDIENCES.json",
  "VOICE.json",
  "VISUAL.json",
  "CHANNELS.json",
  "CONTENT_PILLARS.json",
  "CLAIMS.json",
  "CTA.json",
  "COMPETITORS.json",
  "LEARNINGS.json",
  "SOURCES.json",
] as const;

export const BrandPackSchema = z.object({
  brand_id: BrandIdSchema,
  identity: IdentityModuleSchema,
  positioning: PositioningModuleSchema,
  offerings: OfferingsModuleSchema,
  audiences: AudiencesModuleSchema,
  voice: VoiceModuleSchema,
  visual: VisualModuleSchema,
  channels: ChannelsModuleSchema,
  content_pillars: ContentPillarsModuleSchema,
  claims: ClaimsModuleSchema,
  cta: CtaModuleSchema,
  competitors: CompetitorsModuleSchema,
  learnings: LearningsModuleSchema,
  sources: SourcesModuleSchema,
});
export type BrandPack = z.infer<typeof BrandPackSchema>;

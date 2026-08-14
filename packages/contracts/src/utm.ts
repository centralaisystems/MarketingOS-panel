import { z } from "zod";
import { BrandIdSchema } from "./ids.js";

/**
 * Marketing OS UTM / naming taxonomy.
 * Define before content/campaign production expands.
 * No GA4/ad platform integration in Phase 1.
 */
export const UtmChannelSchema = z.enum([
  "meta",
  "google",
  "linkedin",
  "tiktok",
  "pinterest",
  "youtube",
  "x",
  "email",
  "whatsapp",
  "organic_social",
  "organic_search",
  "referral",
  "direct",
  "other",
]);
export type UtmChannel = z.infer<typeof UtmChannelSchema>;

export const UtmMediumSchema = z.enum([
  "cpc",
  "cpm",
  "paid_social",
  "organic_social",
  "email",
  "sms",
  "referral",
  "affiliate",
  "display",
  "video",
  "other",
]);
export type UtmMedium = z.infer<typeof UtmMediumSchema>;

export const UtmParamsSchema = z.object({
  brand_id: BrandIdSchema,
  utm_source: z.string().min(1),
  utm_medium: UtmMediumSchema,
  utm_campaign: z.string().min(1),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  channel: UtmChannelSchema,
  creative_id: z.string().optional(),
  experiment_id: z.string().uuid().optional(),
  variant_id: z.string().optional(),
});
export type UtmParams = z.infer<typeof UtmParamsSchema>;

/** Canonical campaign naming: {brand_slug}_{yyyy}_{objective_slug}_{channel} */
export function buildCampaignCode(input: {
  brand_slug: string;
  year: number;
  objective_slug: string;
  channel: string;
}): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  return [
    clean(input.brand_slug),
    String(input.year),
    clean(input.objective_slug),
    clean(input.channel),
  ].join("_");
}

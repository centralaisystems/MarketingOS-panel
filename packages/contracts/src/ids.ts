import { z } from "zod";

/** Four strictly isolated brand contexts. */
export const BrandIdSchema = z.enum([
  "LOTIN",
  "VILLA_GLORY",
  "NOX_FORM",
  "NOX_TECH",
]);
export type BrandId = z.infer<typeof BrandIdSchema>;

export const AgentIdSchema = z.enum([
  "A01_MARKETING_DIRECTOR",
  "A02_BRAND_STRATEGIST",
  "A03_RESEARCH_INTELLIGENCE",
  "A04_COMPETITOR_INTELLIGENCE",
  "A05_CONTENT_COPY",
  "A06_SOCIAL_MANAGER",
  "A07_CREATIVE_DIRECTOR",
  "A08_VIDEO_REELS",
  "A09_SEO",
  "A10_PAID_GROWTH",
  "A11_WEBSITE_CRO",
  "A12_CRM_LEAD_INTELLIGENCE",
  "A13_ANALYTICS_OPS",
  "A14_BRAND_GUARDIAN",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const TaskIdSchema = z.string().uuid();
export type TaskId = z.infer<typeof TaskIdSchema>;

export const CampaignIdSchema = z.string().uuid();
export type CampaignId = z.infer<typeof CampaignIdSchema>;

export const ApprovalIdSchema = z.string().uuid();
export type ApprovalId = z.infer<typeof ApprovalIdSchema>;

export const OperatorIdSchema = z.string().min(1);
export type OperatorId = z.infer<typeof OperatorIdSchema>;

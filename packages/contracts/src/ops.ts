import { z } from "zod";
import { AgentIdSchema, BrandIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";
import { CampaignPackSchema } from "./agency.js";
import { TaskSchema } from "./task.js";
import { AuditEventSchema } from "./audit.js";
import {
  EmailOutboxItemSchema,
  OwnerReviewDecisionSchema,
  OwnerReviewRequestSchema,
} from "./owner-review.js";
import { SocialPublishOutboxRecordSchema } from "./social-publish.js";
import { AdOutboxItemSchema, AdStagingJobSchema } from "./paid-ads.js";

/** Campaign row in the Wave 3 ops data plane (file/memory or Supabase). */
export const OpsCampaignStatusSchema = z.enum([
  "DRAFT",
  "AWAITING_OWNER",
  "CHANGES_REQUESTED",
  "INTERNAL_APPROVED",
  "REJECTED",
  "BLOCKED",
]);
export type OpsCampaignStatus = z.infer<typeof OpsCampaignStatusSchema>;

export const OpsCampaignRecordSchema = z.object({
  campaign_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  pack_id: z.string().uuid(),
  objective: z.string().min(1),
  status: OpsCampaignStatusSchema,
  pack: CampaignPackSchema,
  guardian_passed: z.boolean(),
  approvable: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type OpsCampaignRecord = z.infer<typeof OpsCampaignRecordSchema>;

export const OpsCampaignSummarySchema = OpsCampaignRecordSchema.omit({
  pack: true,
});
export type OpsCampaignSummary = z.infer<typeof OpsCampaignSummarySchema>;

export const OpsTaskRecordSchema = TaskSchema;
export type OpsTaskRecord = z.infer<typeof OpsTaskRecordSchema>;

export const OpsApprovalDecisionSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "BLOCKED",
]);
export type OpsApprovalDecision = z.infer<typeof OpsApprovalDecisionSchema>;

export const OpsApprovalRecordSchema = z.object({
  approval_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  task_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  level: ApprovalLevelSchema,
  decision: OpsApprovalDecisionSchema,
  rationale: z.string().optional(),
  actor: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type OpsApprovalRecord = z.infer<typeof OpsApprovalRecordSchema>;

export const OpsAgentRunRecordSchema = z.object({
  run_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  task_id: z.string().uuid().optional(),
  agent: AgentIdSchema,
  result: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type OpsAgentRunRecord = z.infer<typeof OpsAgentRunRecordSchema>;

export const OpsAuditEventSchema = AuditEventSchema;
export type OpsAuditEvent = z.infer<typeof OpsAuditEventSchema>;

export const OpsSnapshotSchema = z.object({
  campaigns: z.array(OpsCampaignRecordSchema).default([]),
  tasks: z.array(OpsTaskRecordSchema).default([]),
  approvals: z.array(OpsApprovalRecordSchema).default([]),
  agent_runs: z.array(OpsAgentRunRecordSchema).default([]),
  audit_log: z.array(OpsAuditEventSchema).default([]),
  owner_reviews: z.array(OwnerReviewRequestSchema).default([]),
  owner_decisions: z.array(OwnerReviewDecisionSchema).default([]),
  email_outbox: z.array(EmailOutboxItemSchema).default([]),
  social_outbox: z.array(SocialPublishOutboxRecordSchema).default([]),
  ad_outbox: z.array(AdOutboxItemSchema).default([]),
  ad_staging_jobs: z.array(AdStagingJobSchema).default([]),
});
export type OpsSnapshot = z.infer<typeof OpsSnapshotSchema>;

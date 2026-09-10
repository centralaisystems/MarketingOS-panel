import { z } from "zod";
import { BrandIdSchema, AgentIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";
import { CapabilitySchema } from "./capabilities.js";

/**
 * In-memory / local audit event — portable shape for future Supabase audit_log.
 */
export const AuditEventSchema = z.object({
  event_id: z.string().uuid(),
  brand_id: BrandIdSchema.optional(),
  agent_id: AgentIdSchema.optional(),
  task_id: z.string().uuid().optional(),
  operator_id: z.string().optional(),
  event_type: z.enum([
    "OBJECTIVE_RECEIVED",
    "BRAND_CONTEXT_LOADED",
    "TASK_CREATED",
    "TASK_ROUTED",
    "AGENT_COMPLETED",
    "GUARDIAN_PASSED",
    "GUARDIAN_REJECTED",
    "APPROVAL_REQUIRED",
    "APPROVAL_DECISION",
    "EXECUTION_BLOCKED",
    "CAPABILITY_DENIED",
    "CONTAMINATION_DETECTED",
    "MEMORY_DRAFT_CREATED",
    "STATE_TRANSITION",
    "EXTERNAL_ACTION_ATTEMPTED",
    "EMAIL_RECORDED",
    "EMAIL_SENT",
    "EMAIL_BLOCKED",
    "OWNER_REVIEW_REQUESTED",
    "OWNER_REVIEW_DECISION",
    "FIGMA_ARRANGE_REQUESTED",
    "FIGMA_ARRANGE_COMPLETED",
    "HIGGSFIELD_GENERATE_REQUESTED",
    "HIGGSFIELD_GENERATE_COMPLETED",
    "HIGGSFIELD_GENERATE_SKIPPED",
    "VIDEO_PRODUCE_REQUESTED",
    "VIDEO_PRODUCE_COMPLETED",
    "SOCIAL_PUBLISH_DRY_RUN",
    "SOCIAL_PUBLISH_LIVE_BLOCKED",
    "AD_STAGING_RECORDED",
    "AD_BUDGET_STAGING_RECORDED",
    "AD_LAUNCH_LIVE_BLOCKED",
    "ERROR",
  ]),
  message: z.string().min(1),
  approval_level: ApprovalLevelSchema.optional(),
  capability: CapabilitySchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

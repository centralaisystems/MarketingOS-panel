import { z } from "zod";

/**
 * Approval levels.
 * Phase 1 may execute only LEVEL_0 and LEVEL_1.
 * LEVEL_2 and LEVEL_3 may be planned but execution is blocked.
 */
export const ApprovalLevelSchema = z.enum([
  "LEVEL_0",
  "LEVEL_1",
  "LEVEL_2",
  "LEVEL_3",
]);
export type ApprovalLevel = z.infer<typeof ApprovalLevelSchema>;

export const APPROVAL_LEVEL_RANK: Record<ApprovalLevel, number> = {
  LEVEL_0: 0,
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
};

/** Highest level Phase 1 runtime may execute without human gate. */
export const PHASE1_MAX_EXECUTABLE_LEVEL: ApprovalLevel = "LEVEL_1";

export const OperatorRoleSchema = z.enum([
  "OPERATOR",
  "APPROVER",
  "ADMIN",
  "VIEWER",
  "SYSTEM",
]);
export type OperatorRole = z.infer<typeof OperatorRoleSchema>;

export const OperatorActionSchema = z.enum([
  "SUBMIT_OBJECTIVE",
  "REQUEST_APPROVAL",
  "APPROVE",
  "REJECT",
  "ESCALATE",
  "CANCEL",
  "VIEW",
]);
export type OperatorAction = z.infer<typeof OperatorActionSchema>;

export const OperatorRefSchema = z.object({
  operator_id: z.string().min(1),
  role: OperatorRoleSchema,
});
export type OperatorRef = z.infer<typeof OperatorRefSchema>;

export const ApprovalDecisionSchema = z.object({
  approval_id: z.string().uuid(),
  brand_id: z.enum(["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"]),
  task_id: z.string().uuid().optional(),
  level: ApprovalLevelSchema,
  decision: z.enum(["PENDING", "APPROVED", "REJECTED", "BLOCKED"]),
  actor: OperatorRefSchema,
  action: OperatorActionSchema,
  rationale: z.string().min(1),
  timestamp: z.string().datetime(),
  external_side_effects_allowed: z.boolean().default(false),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

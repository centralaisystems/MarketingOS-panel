import { z } from "zod";
import { AgentIdSchema, BrandIdSchema } from "./ids.js";
import { ApprovalLevelSchema } from "./approval.js";
import { CapabilitySchema } from "./capabilities.js";

/**
 * Contract-only definition for specialist agents (stubs in Phase 1).
 */
export const AgentContractSchema = z.object({
  agent_id: AgentIdSchema,
  name: z.string().min(1),
  responsibility: z.string().min(1),
  accepted_inputs: z.array(z.string()).min(1),
  outputs: z.array(z.string()).min(1),
  capabilities: z.array(CapabilitySchema),
  forbidden_actions: z.array(z.string()).min(1),
  default_approval_level: ApprovalLevelSchema,
  max_approval_level: ApprovalLevelSchema,
  dependencies: z.array(AgentIdSchema).default([]),
  phase1_implemented: z.boolean(),
  brand_scoped: z.boolean().default(true),
});
export type AgentContract = z.infer<typeof AgentContractSchema>;

export const CrossBrandOperationSchema = z.object({
  authorized: z.literal(true),
  brand_ids: z.array(BrandIdSchema).min(2),
  authorized_by: z.string().min(1),
  rationale: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type CrossBrandOperation = z.infer<typeof CrossBrandOperationSchema>;

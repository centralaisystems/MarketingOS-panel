import { z } from "zod";
import { ApprovalLevelSchema } from "./approval.js";
import { BrandIdSchema, AgentIdSchema } from "./ids.js";
import { ConfidenceSchema, EvidenceSchema, StatementSchema } from "./evidence.js";
import { CapabilitySchema } from "./capabilities.js";

export const AgentResultSchema = z.object({
  task_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  agent: AgentIdSchema,
  summary: z.string().min(1),
  deliverables: z.array(z.record(z.unknown())).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  statements: z.array(StatementSchema).default([]),
  sources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url().optional(),
        retrieved_at: z.string().datetime().optional(),
      }),
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  confidence: ConfidenceSchema,
  recommended_next_action: z.string().min(1),
  recommended_approval_level: ApprovalLevelSchema,
  missing_information: z.array(z.string()).default([]),
  research_requirements: z
    .array(
      z.object({
        question: z.string().min(1),
        reason: z.string().min(1),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      }),
    )
    .default([]),
  capabilities_used: z.array(CapabilitySchema).default([]),
  rejected: z.boolean().optional(),
  rejection_reasons: z.array(z.string()).optional(),
  contamination_flags: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

import { z } from "zod";
import { ApprovalLevelSchema } from "./approval.js";
import { BrandIdSchema, AgentIdSchema } from "./ids.js";
import { WorkflowStateSchema } from "./workflow.js";
import { CapabilitySchema } from "./capabilities.js";

export const TaskStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  task_id: z.string().uuid(),
  brand_id: BrandIdSchema,
  campaign_id: z.string().uuid().optional(),
  objective: z.string().min(1),
  requested_by: z.string().min(1),
  assigned_agent: AgentIdSchema,
  input: z.record(z.unknown()).default({}),
  expected_output: z.string().min(1),
  dependencies: z.array(z.string().uuid()).default([]),
  priority: TaskPrioritySchema.default("MEDIUM"),
  approval_level: ApprovalLevelSchema,
  status: TaskStatusSchema.default("PENDING"),
  workflow_state: WorkflowStateSchema.default("IDEA"),
  required_capabilities: z.array(CapabilitySchema).default([]),
  created_at: z.string().datetime(),
  due_at: z.string().datetime().optional(),
  parent_task_id: z.string().uuid().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

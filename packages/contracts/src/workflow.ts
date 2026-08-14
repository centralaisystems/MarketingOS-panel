import { z } from "zod";

/**
 * Controlled campaign/content lifecycle.
 * Not every task visits every state — legal transitions are explicit.
 */
export const WorkflowStateSchema = z.enum([
  "IDEA",
  "RESEARCHING",
  "PLANNED",
  "IN_PRODUCTION",
  "QA",
  "AWAITING_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "MEASURING",
  "COMPLETED",
  "LEARNING_CAPTURED",
  "REJECTED",
  "BLOCKED",
]);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/** Explicit legal transitions. Approval-required paths cannot skip AWAITING_APPROVAL when moving to public states. */
export const LEGAL_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> =
  {
    IDEA: ["RESEARCHING", "PLANNED", "BLOCKED", "REJECTED"],
    RESEARCHING: ["PLANNED", "IDEA", "BLOCKED", "REJECTED"],
    PLANNED: ["IN_PRODUCTION", "RESEARCHING", "AWAITING_APPROVAL", "BLOCKED", "REJECTED"],
    IN_PRODUCTION: ["QA", "AWAITING_APPROVAL", "BLOCKED", "REJECTED"],
    QA: ["AWAITING_APPROVAL", "IN_PRODUCTION", "REJECTED", "BLOCKED"],
    AWAITING_APPROVAL: ["APPROVED", "REJECTED", "IN_PRODUCTION", "BLOCKED"],
    APPROVED: ["SCHEDULED", "PUBLISHED", "IN_PRODUCTION", "COMPLETED"],
    SCHEDULED: ["PUBLISHED", "BLOCKED", "REJECTED"],
    PUBLISHED: ["MEASURING", "COMPLETED"],
    MEASURING: ["COMPLETED", "LEARNING_CAPTURED"],
    COMPLETED: ["LEARNING_CAPTURED"],
    LEARNING_CAPTURED: [],
    REJECTED: ["IDEA", "PLANNED", "IN_PRODUCTION"],
    BLOCKED: ["IDEA", "PLANNED", "AWAITING_APPROVAL"],
  };

/** States that imply external publication or scheduling — require Level 2+ and Phase 1 block. */
export const EXTERNAL_PUBLIC_STATES: readonly WorkflowState[] = [
  "SCHEDULED",
  "PUBLISHED",
] as const;

export function canTransition(
  from: WorkflowState,
  to: WorkflowState,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

import {
  type WorkflowState,
  canTransition,
  EXTERNAL_PUBLIC_STATES,
  APPROVAL_LEVEL_RANK,
  type ApprovalLevel,
} from "@marketing-os/contracts";
import type { AuditSink } from "./audit.js";

export type TransitionResult =
  | { ok: true; from: WorkflowState; to: WorkflowState }
  | { ok: false; reason: string };

/**
 * Validate and apply a workflow transition.
 * Cannot enter SCHEDULED/PUBLISHED without prior APPROVED and Level 2+ (blocked in Phase 1).
 */
export function transitionWorkflow(
  from: WorkflowState,
  to: WorkflowState,
  opts: {
    audit: AuditSink;
    brand_id?: import("@marketing-os/contracts").BrandId;
    task_id?: string;
    approval_level?: ApprovalLevel;
    phase1?: boolean;
  },
): TransitionResult {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `Illegal transition ${from} → ${to}`,
    };
  }

  const phase1 = opts.phase1 !== false;

  if (EXTERNAL_PUBLIC_STATES.includes(to)) {
    if (from !== "APPROVED" && from !== "SCHEDULED") {
      return {
        ok: false,
        reason: `Cannot enter ${to} without APPROVED (from=${from})`,
      };
    }
    const level = opts.approval_level ?? "LEVEL_2";
    if (APPROVAL_LEVEL_RANK[level] < APPROVAL_LEVEL_RANK.LEVEL_2) {
      return {
        ok: false,
        reason: `${to} requires approval Level 2+`,
      };
    }
    if (phase1) {
      opts.audit.append({
        brand_id: opts.brand_id,
        task_id: opts.task_id,
        event_type: "EXECUTION_BLOCKED",
        message: `Phase 1 blocks transition to ${to}`,
        approval_level: level,
        metadata: { from, to },
      });
      return {
        ok: false,
        reason: `Phase 1 blocks external public state ${to}`,
      };
    }
  }

  opts.audit.append({
    brand_id: opts.brand_id,
    task_id: opts.task_id,
    event_type: "STATE_TRANSITION",
    message: `${from} → ${to}`,
    metadata: { from, to },
  });

  return { ok: true, from, to };
}

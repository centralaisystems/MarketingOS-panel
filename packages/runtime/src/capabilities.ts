import {
  type ApprovalLevel,
  type Capability,
  type AgentId,
  APPROVAL_LEVEL_RANK,
  PHASE1_MAX_EXECUTABLE_LEVEL,
  agentHasCapability,
  isExternalWriteCapability,
} from "@marketing-os/contracts";
import type { AuditSink } from "./audit.js";
import { blockExecution, denyCapability } from "./audit.js";

export type CapabilityCheckResult =
  | { ok: true }
  | { ok: false; reason: string; code: "CAPABILITY_DENIED" | "EXTERNAL_WRITE_BLOCKED" | "APPROVAL_BLOCKED" };

export function assertAgentCapability(
  agentId: AgentId,
  capability: Capability,
  audit: AuditSink,
  ctx?: { brand_id?: import("@marketing-os/contracts").BrandId; task_id?: string },
): CapabilityCheckResult {
  if (!agentHasCapability(agentId, capability)) {
    const reason = `Agent ${agentId} does not have capability ${capability}`;
    denyCapability(audit, {
      brand_id: ctx?.brand_id,
      agent_id: agentId,
      task_id: ctx?.task_id,
      capability,
      reason,
    });
    return { ok: false, reason, code: "CAPABILITY_DENIED" };
  }

  if (isExternalWriteCapability(capability)) {
    const reason = `Phase 1 blocks external write capability ${capability}`;
    denyCapability(audit, {
      brand_id: ctx?.brand_id,
      agent_id: agentId,
      task_id: ctx?.task_id,
      capability,
      reason,
    });
    return { ok: false, reason, code: "EXTERNAL_WRITE_BLOCKED" };
  }

  return { ok: true };
}

export function assertExecutableApprovalLevel(
  level: ApprovalLevel,
  audit: AuditSink,
  ctx?: {
    brand_id?: import("@marketing-os/contracts").BrandId;
    agent_id?: AgentId;
    task_id?: string;
  },
): CapabilityCheckResult {
  if (APPROVAL_LEVEL_RANK[level] > APPROVAL_LEVEL_RANK[PHASE1_MAX_EXECUTABLE_LEVEL]) {
    const reason = `Phase 1 cannot execute ${level} actions (max ${PHASE1_MAX_EXECUTABLE_LEVEL}). Action may be planned only.`;
    blockExecution(audit, {
      brand_id: ctx?.brand_id,
      agent_id: ctx?.agent_id,
      task_id: ctx?.task_id,
      approval_level: level,
      reason,
    });
    return { ok: false, reason, code: "APPROVAL_BLOCKED" };
  }
  return { ok: true };
}

/** Detect high-risk action intent from free-text objectives. */
export function detectRequestedApprovalLevel(objective: string): ApprovalLevel {
  const text = objective.toLowerCase();
  const level3 =
    /\b(launch|publish ads?|spend|budget|aed\s*\d|contact customer|delete public|increase budget|decrease budget|meta campaign|google ads)\b/.test(
      text,
    ) || /\b(launch this meta|launch ads?)\b/.test(text);
  if (level3) return "LEVEL_3";

  const level2 =
    /\b(publish|schedule post|go live|deploy (to )?production|send email|website change)\b/.test(
      text,
    );
  if (level2) return "LEVEL_2";

  const level1 =
    /\b(draft|prepare|strategy|campaign|content|copy|brief|plan)\b/.test(text);
  if (level1) return "LEVEL_1";

  return "LEVEL_0";
}

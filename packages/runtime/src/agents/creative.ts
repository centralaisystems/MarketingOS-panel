import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";

export function runCreativeDirector(
  task: Task,
  pack: BrandPack,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A07_CREATIVE_DIRECTOR",
    "PRODUCE_CREATIVE_BRIEF",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A07_CREATIVE_DIRECTOR",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  const visualKnown = pack.visual.colors.status !== "MISSING";

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A07_CREATIVE_DIRECTOR",
    summary: `Creative brief (internal) for ${task.brand_id}.`,
    deliverables: [
      {
        type: "creative_brief",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        objective: task.objective,
        visual_direction: visualKnown
          ? pack.visual.colors.value
          : "Visual kit MISSING — keep creative direction generic until kit verified",
        do_not: [
          "Invent product specs, prices, or ROI",
          "Use foreign brand imagery or names",
        ],
      },
    ],
    evidence: [],
    confidence: visualKnown ? "MEDIUM" : "LOW",
    assumptions: [],
    missing_information: visualKnown ? [] : ["visual.colors"],
    recommended_next_action: "Produce assets only after human brief approval",
    recommended_approval_level: "LEVEL_1",
    capabilities_used: ["READ_BRAND_CONTEXT", "PRODUCE_CREATIVE_BRIEF"],
    created_at: new Date().toISOString(),
  });
}

export function createCreativeTask(
  brandId: Task["brand_id"],
  objective: string,
  requestedBy: string,
  parentTaskId?: string,
): Task {
  return {
    task_id: randomUUID(),
    brand_id: brandId,
    objective,
    requested_by: requestedBy,
    assigned_agent: "A07_CREATIVE_DIRECTOR",
    input: { objective },
    expected_output: "Creative brief — no production publish",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "MEDIUM",
    approval_level: "LEVEL_1",
    status: "PENDING",
    workflow_state: "IN_PRODUCTION",
    required_capabilities: ["READ_BRAND_CONTEXT", "PRODUCE_CREATIVE_BRIEF"],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

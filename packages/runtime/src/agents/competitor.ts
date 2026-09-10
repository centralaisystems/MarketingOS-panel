import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";

export function runCompetitorIntelligence(
  task: Task,
  pack: BrandPack,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A04_COMPETITOR_INTELLIGENCE",
    "PRODUCE_INTERNAL_ANALYSIS",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A04_COMPETITOR_INTELLIGENCE",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  const known = pack.competitors.competitors ?? [];
  const notes =
    known.length === 0
      ? "No verified competitors in brand pack — do not invent rival names for public attack ads."
      : `Internal competitor entries present: ${known.length} (strategy use only).`;

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A04_COMPETITOR_INTELLIGENCE",
    summary: `Competitor intelligence (internal) for ${task.brand_id}.`,
    deliverables: [
      {
        type: "competitor_brief",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        notes,
        invent_competitors: false,
      },
    ],
    evidence: [],
    confidence: known.length ? "MEDIUM" : "LOW",
    assumptions: [
      "Competitor names for public attack ads require separate approval.",
    ],
    missing_information:
      known.length === 0 ? ["competitors.competitors"] : [],
    recommended_next_action: "Use for internal strategy only",
    recommended_approval_level: "LEVEL_1",
    capabilities_used: ["READ_BRAND_CONTEXT", "READ_COMPETITORS", "PRODUCE_INTERNAL_ANALYSIS"],
    created_at: new Date().toISOString(),
  });
}

export function createCompetitorTask(
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
    assigned_agent: "A04_COMPETITOR_INTELLIGENCE",
    input: { objective },
    expected_output: "Internal competitor brief without invented attack ads",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "MEDIUM",
    approval_level: "LEVEL_1",
    status: "PENDING",
    workflow_state: "IN_PRODUCTION",
    required_capabilities: [
      "READ_BRAND_CONTEXT",
      "READ_COMPETITORS",
      "PRODUCE_INTERNAL_ANALYSIS",
    ],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

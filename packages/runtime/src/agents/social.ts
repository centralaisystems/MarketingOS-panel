import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";

export function runSocialManager(
  task: Task,
  pack: BrandPack,
  contentResult: AgentResult,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A06_SOCIAL_MANAGER",
    "PRODUCE_DRAFT_CONTENT",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A06_SOCIAL_MANAGER",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  // Ensure publish capability remains denied for this agent path
  assertAgentCapability("A06_SOCIAL_MANAGER", "PUBLISH_SOCIAL", audit, {
    brand_id: task.brand_id,
    task_id: task.task_id,
  });

  const tone = pack.voice.tone.status === "VERIFIED" ? pack.voice.tone.value : null;
  const channels = pack.channels.channels ?? [];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A06_SOCIAL_MANAGER",
    summary: `Social calendar draft (internal, not scheduled) for ${task.brand_id}.`,
    deliverables: [
      {
        type: "social_calendar_draft",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        live_publish: false,
        tone,
        channel_count: channels.length,
        week: [
          {
            day: "Mon",
            idea: `Hook related to: ${task.objective}`,
            caption_hint: contentResult.summary,
          },
          {
            day: "Wed",
            idea: "Proof / process / product story (verified facts only)",
            caption_hint: "Cite brand pack; no invented claims",
          },
          {
            day: "Fri",
            idea: "CTA / conversation starter",
            caption_hint: "Use approved CTA library when present",
          },
        ],
      },
    ],
    evidence: [],
    confidence: "MEDIUM",
    assumptions: ["Calendar is a draft plan — not scheduled or published."],
    missing_information: channels.length === 0 ? ["channels.channels"] : [],
    recommended_next_action: "Human review before any scheduling",
    recommended_approval_level: "LEVEL_1",
    capabilities_used: ["READ_BRAND_CONTEXT", "PRODUCE_DRAFT_CONTENT"],
    created_at: new Date().toISOString(),
  });
}

export function createSocialTask(
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
    assigned_agent: "A06_SOCIAL_MANAGER",
    input: { objective },
    expected_output: "Draft social calendar — no live publish",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "MEDIUM",
    approval_level: "LEVEL_1",
    status: "PENDING",
    workflow_state: "IN_PRODUCTION",
    required_capabilities: ["READ_BRAND_CONTEXT", "PRODUCE_DRAFT_CONTENT"],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

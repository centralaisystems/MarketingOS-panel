import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandProfile,
  type Task,
  listMissingKnowledge,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";

function fieldNote(profile: BrandProfile, key: keyof BrandProfile): string {
  const field = profile[key];
  if (typeof field === "object" && field && "status" in field) {
    const f = field as { status: string; value?: unknown; notes?: string };
    if (f.status === "MISSING") return `MISSING`;
    if (f.value !== undefined) return `${f.status}: ${JSON.stringify(f.value)}`;
    return f.status;
  }
  return "n/a";
}

export function runBrandStrategist(
  task: Task,
  profile: BrandProfile,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A02_BRAND_STRATEGIST",
    "PRODUCE_STRATEGY",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A02_BRAND_STRATEGIST",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  const missing = listMissingKnowledge(profile);
  const statements = [
    {
      text: `Campaign direction for ${profile.display_name}: ${task.objective}`,
      kind: "RECOMMENDATION" as const,
      confidence: "MEDIUM" as const,
      evidence_ids: [],
    },
    {
      text: `Positioning status: ${fieldNote(profile, "positioning")}`,
      kind: (profile.positioning.status === "VERIFIED" ? "FACT" : "OBSERVATION") as
        | "FACT"
        | "OBSERVATION",
      confidence: (profile.positioning.status === "VERIFIED" ? "VERIFIED" : "LOW") as
        | "VERIFIED"
        | "LOW",
      evidence_ids: [],
    },
    {
      text: `Audience status: ${fieldNote(profile, "audiences")}`,
      kind: (profile.audiences.status === "VERIFIED" ? "FACT" : "OBSERVATION") as
        | "FACT"
        | "OBSERVATION",
      confidence: (profile.audiences.status === "VERIFIED" ? "VERIFIED" : "LOW") as
        | "VERIFIED"
        | "LOW",
      evidence_ids: [],
    },
  ];

  const assumptions: string[] = [];
  if (missing.includes("positioning")) {
    assumptions.push(
      "Positioning is MISSING — strategy uses only objective wording and must not invent brand claims.",
    );
  }
  if (missing.includes("audiences") || missing.includes("personas")) {
    assumptions.push(
      "Audience/persona details are incomplete — channel and offer recommendations are provisional.",
    );
  }

  const deliverables = [
    {
      type: "campaign_strategy_outline",
      brand_id: task.brand_id,
      objective: task.objective,
      known_positioning: profile.positioning.status === "MISSING" ? null : profile.positioning.value,
      known_audiences: profile.audiences.status === "MISSING" ? null : profile.audiences.value,
      known_tone: profile.tone.status === "MISSING" ? null : profile.tone.value,
      channel_reasoning:
        profile.channels.status === "MISSING"
          ? "Channel mix cannot be finalized until brand channels are onboarded."
          : profile.channels.value,
      offer_messaging:
        profile.cta_library.status === "MISSING"
          ? "CTA/offer library MISSING — use generic inquiry CTA only; do not invent discounts or guarantees."
          : profile.cta_library.value,
      missing_for_strategy: missing,
    },
  ];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A02_BRAND_STRATEGIST",
    summary: `Strategy outline for ${profile.display_name}. Missing knowledge fields: ${missing.length}.`,
    deliverables,
    statements,
    assumptions,
    risks: [
      missing.length
        ? "High risk of inaccurate positioning if strategy is executed before brand onboarding."
        : "Low structural risk; still requires Guardian review before any public use.",
    ],
    confidence: missing.length > 8 ? "LOW" : missing.length > 3 ? "MEDIUM" : "HIGH",
    recommended_next_action:
      missing.length > 0
        ? "Complete brand onboarding for MISSING fields before production creative."
        : "Proceed to research gap analysis and draft messaging concepts.",
    recommended_approval_level: "LEVEL_1",
    missing_information: missing.map((k) => `brand.${k}`),
    capabilities_used: ["READ_BRAND_CONTEXT", "PRODUCE_STRATEGY"],
    created_at: new Date().toISOString(),
  });
}

export function createStrategistTask(
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
    assigned_agent: "A02_BRAND_STRATEGIST",
    input: { objective },
    expected_output: "Campaign strategy outline with facts vs assumptions labeled",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "HIGH",
    approval_level: "LEVEL_1",
    status: "PENDING",
    workflow_state: "PLANNED",
    required_capabilities: ["READ_BRAND_CONTEXT", "PRODUCE_STRATEGY"],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

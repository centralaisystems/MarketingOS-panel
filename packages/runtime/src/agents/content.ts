import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandProfile,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";

export function runContentCopy(
  task: Task,
  profile: BrandProfile,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A05_CONTENT_COPY",
    "PRODUCE_DRAFT_CONTENT",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A05_CONTENT_COPY",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  const toneKnown = profile.tone.status !== "MISSING";
  const ctaKnown = profile.cta_library.status !== "MISSING";
  const claimsKnown = profile.claims_restrictions.status !== "MISSING";

  const toneGuidance = toneKnown
    ? profile.tone.value
    : "Tone MISSING — use neutral professional draft; do not invent brand voice traits.";

  const cta = ctaKnown
    ? profile.cta_library.value
    : "Enquire for details (generic — CTA library MISSING)";

  const restrictions = claimsKnown
    ? profile.claims_restrictions.value
    : "No verified claims list — avoid guarantees, pricing, ROI promises, and unverified superlatives.";

  const headline = `${profile.display_name}: ${task.objective}`.slice(0, 120);
  const body = [
    `Draft concept for ${profile.display_name} only.`,
    `Objective: ${task.objective}`,
    `Tone guidance: ${typeof toneGuidance === "string" ? toneGuidance : JSON.stringify(toneGuidance)}`,
    `CTA: ${typeof cta === "string" ? cta : JSON.stringify(cta)}`,
    "",
    "This is LEVEL_1 draft copy for internal review. Not approved for publishing.",
  ].join("\n");

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A05_CONTENT_COPY",
    summary: `Draft campaign messaging concepts for ${profile.display_name} (internal only).`,
    deliverables: [
      {
        type: "draft_copy_pack",
        brand_id: task.brand_id,
        language: "en",
        approval_level: "LEVEL_1",
        headline,
        body,
        cta,
        invented_claims: false,
        compliance_notes:
          typeof restrictions === "string"
            ? restrictions
            : JSON.stringify(restrictions),
      },
    ],
    statements: [
      {
        text: "Draft copy contains no invented brand claims; MISSING fields called out.",
        kind: "OBSERVATION",
        confidence: "MEDIUM",
        evidence_ids: [],
      },
    ],
    assumptions: [
      ...(toneKnown ? [] : ["Brand tone is MISSING — draft is provisional."]),
      ...(ctaKnown ? [] : ["CTA library MISSING — generic enquiry CTA used."]),
    ],
    risks: ["Publishing this draft without Guardian + Level 2 approval is forbidden."],
    confidence: toneKnown && claimsKnown ? "MEDIUM" : "LOW",
    recommended_next_action: "Run Brand Guardian verification before any human approval request.",
    recommended_approval_level: "LEVEL_1",
    missing_information: [
      ...(!toneKnown ? ["brand.tone"] : []),
      ...(!ctaKnown ? ["brand.cta_library"] : []),
      ...(!claimsKnown ? ["brand.claims_restrictions"] : []),
    ],
    capabilities_used: ["READ_BRAND_CONTEXT", "PRODUCE_DRAFT_CONTENT"],
    created_at: new Date().toISOString(),
  });
}

export function createContentTask(
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
    assigned_agent: "A05_CONTENT_COPY",
    input: { objective },
    expected_output: "Draft messaging concepts without invented claims",
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

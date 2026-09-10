import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";
import {
  citedPathsUsed,
  extractPackDraftSignals,
  isVerifiedFact,
  packCategoryLabel,
  packDisplayName,
  primaryCta,
  renderCited,
  renderCitedValue,
  verifiedOfferingNames,
} from "../pack-draft-signals.js";

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

  const signals = extractPackDraftSignals(pack);
  const name = packDisplayName(signals, task.brand_id);
  const category = packCategoryLabel(signals);
  const offerings = verifiedOfferingNames(signals);
  const cta = primaryCta(signals);
  const visualKnown = signals.visual_kit_present;

  const subjectParts = [
    category && isVerifiedFact(signals.category)
      ? `Subject category (VERIFIED): ${category}.`
      : category
        ? `Subject category [${signals.category?.status}]: ${category}.`
        : null,
    signals.description
      ? `Identity (${signals.description.status}): ${renderCited(signals.description)}`
      : null,
    signals.markets
      ? `Markets (${signals.markets.status}): ${renderCited(signals.markets)}`
      : null,
  ].filter(Boolean);

  const visual_direction = visualKnown
    ? renderCitedValue(pack.visual.colors.value)
    : [
        "Visual kit MISSING — do not invent a design system, palette, typography, or materials.",
        subjectParts.join(" "),
        offerings.length
          ? `Scene subjects limited to VERIFIED category names: ${offerings.join(", ")}.`
          : "No VERIFIED offering names — keep scenes generic to the verified category only.",
        "Do not depict invented SKUs, prices, or certifications.",
      ]
        .filter(Boolean)
        .join(" ");

  const do_not = [
    ...(signals.prohibited_claims
      ? renderCitedValue(signals.prohibited_claims.value)
          .split(/,\s*/)
          .filter(Boolean)
      : ["Invent product specs, prices, or ROI"]),
    "Use foreign brand imagery or names",
    "Invent a visual identity while visual.* is MISSING",
  ];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A07_CREATIVE_DIRECTOR",
    summary: `Creative brief (internal) for ${name}.`,
    deliverables: [
      {
        type: "creative_brief",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        objective: task.objective,
        subject_context: subjectParts.join(" "),
        visual_direction,
        scene_subjects: offerings,
        cta: cta
          ? cta.label_status === "VERIFIED"
            ? cta.label
            : `${cta.label} [${cta.label_status}]`
          : null,
        audiences: signals.audiences
          .filter((a) => a.label_status === "VERIFIED")
          .map((a) => `${a.role}: ${a.label}`),
        pack_citations: citedPathsUsed(signals),
        do_not,
      },
    ],
    evidence: [],
    confidence: visualKnown || isVerifiedFact(signals.category) ? "MEDIUM" : "LOW",
    assumptions: visualKnown
      ? []
      : ["Visual kit MISSING — brief describes subject matter only, not a fabricated look."],
    missing_information: [
      ...(visualKnown ? [] : ["visual.colors", "visual.imagery"]),
      ...(signals.channel_count === 0 ? ["channels.channels"] : []),
    ],
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

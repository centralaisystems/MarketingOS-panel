import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type BrandProfile,
  type Task,
  listMissingKnowledge,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";
import {
  extractPackDraftSignals,
  packCategoryLabel,
  packDisplayName,
  primaryCta,
  renderCited,
  verifiedOfferingNames,
} from "../pack-draft-signals.js";

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
  pack?: BrandPack,
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
  const signals = pack ? extractPackDraftSignals(pack) : undefined;
  const displayName = signals
    ? packDisplayName(signals, profile.display_name)
    : profile.display_name;

  const packPositioning = signals?.positioning_statement
    ? renderCited(signals.positioning_statement)
    : null;
  const packAudiences = signals?.audiences.length
    ? signals.audiences.map((a) =>
        a.label_status === "VERIFIED"
          ? `${a.role}: ${a.label}`
          : `${a.role}: ${a.label} [${a.label_status}]`,
      )
    : null;
  const packTone = signals?.tone ? renderCited(signals.tone) : null;
  const packCta = signals ? primaryCta(signals) : undefined;
  const packCategory = signals ? packCategoryLabel(signals) : undefined;

  const statements = [
    {
      text: `Campaign direction for ${displayName}: ${task.objective}`,
      kind: "RECOMMENDATION" as const,
      confidence: "MEDIUM" as const,
      evidence_ids: [],
    },
    {
      text: packPositioning
        ? `Positioning (${signals?.positioning_statement?.status}): ${packPositioning}`
        : `Positioning status: ${fieldNote(profile, "positioning")}`,
      kind: (signals?.positioning_statement?.status === "VERIFIED" ||
      profile.positioning.status === "VERIFIED"
        ? "FACT"
        : "OBSERVATION") as "FACT" | "OBSERVATION",
      confidence: (signals?.positioning_statement?.status === "VERIFIED" ||
      profile.positioning.status === "VERIFIED"
        ? "VERIFIED"
        : "LOW") as "VERIFIED" | "LOW",
      evidence_ids: [],
    },
    {
      text: packAudiences
        ? `Audiences (pack): ${packAudiences.join("; ")}`
        : `Audience status: ${fieldNote(profile, "audiences")}`,
      kind: (signals?.audiences.some((a) => a.label_status === "VERIFIED") ||
      profile.audiences.status === "VERIFIED"
        ? "FACT"
        : "OBSERVATION") as "FACT" | "OBSERVATION",
      confidence: (signals?.audiences.some((a) => a.label_status === "VERIFIED") ||
      profile.audiences.status === "VERIFIED"
        ? "VERIFIED"
        : "LOW") as "VERIFIED" | "LOW",
      evidence_ids: [],
    },
  ];

  const assumptions: string[] = [];
  if (!packPositioning && missing.includes("positioning")) {
    assumptions.push(
      "Positioning is MISSING — strategy uses only objective wording and must not invent brand claims.",
    );
  }
  if (!packAudiences && (missing.includes("audiences") || missing.includes("personas"))) {
    assumptions.push(
      "Audience/persona details are incomplete — channel and offer recommendations are provisional.",
    );
  }
  if (signals?.channel_count === 0) {
    assumptions.push(
      "Owned channels list is MISSING — channel mix stays provisional.",
    );
  }

  const deliverables = [
    {
      type: "campaign_strategy_outline",
      brand_id: task.brand_id,
      objective: task.objective,
      known_positioning:
        packPositioning ??
        (profile.positioning.status === "MISSING" ? null : profile.positioning.value),
      known_category: packCategory ?? null,
      known_audiences:
        packAudiences ??
        (profile.audiences.status === "MISSING" ? null : profile.audiences.value),
      known_tone:
        packTone ?? (profile.tone.status === "MISSING" ? null : profile.tone.value),
      known_offerings: signals ? verifiedOfferingNames(signals) : [],
      known_differentiation: signals?.differentiation
        ? renderCited(signals.differentiation)
        : null,
      channel_reasoning:
        signals?.channel_count === 0
          ? "Channel mix cannot be finalized until brand channels are onboarded."
          : profile.channels.status === "MISSING"
            ? "Channel mix cannot be finalized until brand channels are onboarded."
            : profile.channels.value,
      offer_messaging: packCta
        ? packCta.label_status === "VERIFIED"
          ? packCta.label
          : `${packCta.label} [${packCta.label_status}]`
        : profile.cta_library.status === "MISSING"
          ? "CTA/offer library MISSING — use generic inquiry CTA only; do not invent discounts or guarantees."
          : profile.cta_library.value,
      missing_for_strategy: signals
        ? [...new Set([...missing, ...signals.missing_paths])]
        : missing,
    },
  ];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A02_BRAND_STRATEGIST",
    summary: `Strategy outline for ${displayName}. Missing knowledge fields: ${missing.length}.`,
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

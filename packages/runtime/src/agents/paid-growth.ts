import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  PaidRecommendationSchema,
  type AgentResult,
  type BrandPack,
  type Task,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";
import {
  extractPackDraftSignals,
  packCategoryLabel,
  primaryCta,
  renderCited,
  renderCitedValue,
} from "../pack-draft-signals.js";

/**
 * A10 Paid Growth — recommendations only. Never launches ads or changes budgets.
 */
export function runPaidGrowthRecommend(
  task: Task,
  pack: BrandPack,
  audit: AuditSink,
): AgentResult {
  const cap = assertAgentCapability(
    "A10_PAID_GROWTH",
    "PRODUCE_STRATEGY",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A10_PAID_GROWTH",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  // Explicitly probe forbidden capabilities (must deny)
  assertAgentCapability("A10_PAID_GROWTH", "LAUNCH_AD", audit, {
    brand_id: task.brand_id,
    task_id: task.task_id,
  });
  assertAgentCapability("A10_PAID_GROWTH", "CHANGE_AD_BUDGET", audit, {
    brand_id: task.brand_id,
    task_id: task.task_id,
  });

  const signals = extractPackDraftSignals(pack);
  const category = packCategoryLabel(signals);
  const cta = primaryCta(signals);

  const audience_notes = [
    "Build audiences from VERIFIED brand pack segments only",
    "Do not upload PII to ad platforms from Marketing OS prompts",
    ...signals.audiences
      .filter((a) => a.label_status === "VERIFIED")
      .map((a) => `${a.role} (VERIFIED): ${a.label}`),
    ...signals.audiences.flatMap((a) => {
      const notes: string[] = [];
      const geography = a.geography;
      const preferred = a.preferred_channels;
      if (geography && geography.status !== "VERIFIED") {
        notes.push(
          `${a.label} geography ${geography.status}: ${renderCited(geography)} — not exclusive market proof`,
        );
      }
      if (preferred && preferred.status !== "VERIFIED") {
        notes.push(
          `${a.label} preferred channels ${preferred.status}: ${renderCited(preferred)}`,
        );
      }
      return notes;
    }),
  ];

  const creative_notes = [
    "Use Guardian-passed drafts only",
    "No ROI/guarantee language",
    ...(signals.tone
      ? [`Tone (${signals.tone.status}): ${renderCited(signals.tone)}`]
      : ["Tone MISSING — do not invent a paid voice"]),
    ...(category
      ? [
          `Subject category (${signals.category?.status}): ${category} — do not invent SKUs or prices`,
        ]
      : []),
    ...(cta
      ? [
          `CTA (${cta.label_status}): ${cta.label}${
            cta.intent ? ` / intent ${renderCited(cta.intent)}` : ""
          }`,
        ]
      : []),
    ...(signals.prohibited_claims
      ? [`Restrictions (${signals.prohibited_claims.status}): ${renderCitedValue(signals.prohibited_claims.value)}`]
      : []),
  ];

  const recommendation = PaidRecommendationSchema.parse({
    brand_id: task.brand_id,
    platform: "META",
    objective: task.objective,
    audience_notes,
    creative_notes,
    budget_notes: [
      "Budget changes require WAVE_6 + Level 3 — not available in recommend mode",
    ],
    test_plan: [
      "A/B creative hook vs proof",
      "Measure CPL/CPA in read-only analytics (Wave 4+)",
    ],
    launch_allowed: false,
  });

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A10_PAID_GROWTH",
    summary: `Paid growth recommendations only (no launch) for ${task.brand_id}.`,
    deliverables: [
      {
        type: "paid_recommendation",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        recommendation,
        launch_allowed: false,
      },
    ],
    evidence: [],
    confidence: "MEDIUM",
    assumptions: ["No live ad account writes in this wave."],
    missing_information:
      pack.audiences.segments.length === 0 ? ["audiences.segments"] : [],
    recommended_next_action: "Human review; launch blocked until Wave 6 approval",
    recommended_approval_level: "LEVEL_1",
    capabilities_used: ["READ_BRAND_CONTEXT", "PRODUCE_STRATEGY"],
    created_at: new Date().toISOString(),
  });
}

export function createPaidGrowthTask(
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
    assigned_agent: "A10_PAID_GROWTH",
    input: { objective },
    expected_output: "Paid recommendations — no launch or budget change",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "MEDIUM",
    approval_level: "LEVEL_1",
    status: "PENDING",
    workflow_state: "IN_PRODUCTION",
    required_capabilities: ["READ_BRAND_CONTEXT", "PRODUCE_STRATEGY"],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

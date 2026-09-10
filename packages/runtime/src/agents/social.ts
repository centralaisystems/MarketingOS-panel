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
  verifiedOfferingNames,
} from "../pack-draft-signals.js";

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

  const signals = extractPackDraftSignals(pack);
  const name = packDisplayName(signals, task.brand_id);
  const category = packCategoryLabel(signals);
  const tone = signals.tone ? renderCited(signals.tone) : null;
  const offerings = verifiedOfferingNames(signals);
  const cta = primaryCta(signals);
  const channelNote =
    signals.channel_count === 0
      ? "Owned channels MISSING — ideas are unschedulable internal drafts."
      : `${signals.channel_count} pack channel(s) recorded.`;

  const hookContext = [
    isVerifiedFact(signals.description) ? renderCited(signals.description) : null,
    category && isVerifiedFact(signals.category)
      ? `Category: ${category}.`
      : category
        ? `Category ${signals.category?.status}: ${category}.`
        : null,
  ]
    .filter(Boolean)
    .join(" ");

  const monCaption = [
    hookContext || `${name} internal draft.`,
    `Supports objective: ${task.objective}.`,
    tone ? `Tone (${signals.tone?.status}): ${tone}.` : "Tone MISSING — keep language neutral.",
    "Not scheduled. Not approved for publishing.",
  ].join(" ");

  const wedCaption = offerings.length
    ? `Recorded collection / offering categories (names only, not stock or SKUs): ${offerings.join(", ")}. Do not invent materials, prices, or availability.`
    : "No VERIFIED offering names in brand pack — do not invent product stories.";

  const ctaLabel = cta
    ? cta.label_status === "VERIFIED"
      ? cta.label
      : `${cta.label} [${cta.label_status}]`
    : "Use approved CTA library when present";

  const differentiation = signals.differentiation
    ? renderCited(signals.differentiation)
    : null;
  const friCaption = [
    `CTA: ${ctaLabel}.`,
    differentiation
      ? `Operating characteristics (${signals.differentiation?.status}; not superiority): ${differentiation}.`
      : null,
    channelNote,
  ]
    .filter(Boolean)
    .join(" ");

  const week = [
    {
      day: "Mon",
      idea: category
        ? `Hook from pack category (${category}) for: ${task.objective}`
        : `Hook related to: ${task.objective}`,
      caption: monCaption,
      caption_hint: monCaption,
    },
    {
      day: "Wed",
      idea: offerings.length
        ? "Collection / category story from VERIFIED offering names only"
        : "Proof / process / product story (verified facts only)",
      caption: wedCaption,
      caption_hint: wedCaption,
    },
    {
      day: "Fri",
      idea: cta
        ? `Conversation / enquiry path using pack CTA (${cta.label})`
        : "CTA / conversation starter",
      caption: friCaption,
      caption_hint: friCaption,
    },
  ];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A06_SOCIAL_MANAGER",
    summary: `Social calendar draft (internal, not scheduled) for ${name}.`,
    deliverables: [
      {
        type: "social_calendar_draft",
        brand_id: task.brand_id,
        approval_level: "LEVEL_1",
        live_publish: false,
        tone,
        channel_count: signals.channel_count,
        pack_citations: citedPathsUsed(signals),
        week,
      },
    ],
    evidence: [],
    statements: [
      {
        text: contentResult.summary,
        kind: "OBSERVATION" as const,
        confidence: "MEDIUM" as const,
        evidence_ids: [],
      },
    ],
    confidence: "MEDIUM",
    assumptions: ["Calendar is a draft plan — not scheduled or published."],
    missing_information: [
      ...(signals.channel_count === 0 ? ["channels.channels"] : []),
      ...(!signals.visual_kit_present ? ["visual.imagery"] : []),
    ],
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

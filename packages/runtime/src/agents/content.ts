import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandPack,
  type BrandProfile,
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
  verifiedAudienceLabels,
  verifiedOfferingNames,
  type PackDraftSignals,
} from "../pack-draft-signals.js";

function draftFromPack(
  task: Task,
  profile: BrandProfile,
  pack: BrandPack,
): {
  headline: string;
  body: string;
  cta: string;
  restrictions: string;
  toneKnown: boolean;
  ctaKnown: boolean;
  claimsKnown: boolean;
  missing: string[];
  signals: PackDraftSignals;
} {
  const signals = extractPackDraftSignals(pack);
  const name = packDisplayName(signals, profile.display_name);
  const category = packCategoryLabel(signals);
  const categoryLine = category
    ? isVerifiedFact(signals.category)
      ? category
      : `${category} [${signals.category?.status}]`
    : undefined;

  const headline = (
    categoryLine ? `${name} — ${categoryLine}` : `${name}: ${task.objective}`
  ).slice(0, 120);

  const toneKnown = Boolean(signals.tone);
  const ctaKnown = signals.ctas.length > 0;
  const claimsKnown = Boolean(signals.prohibited_claims);
  const ctaEntry = primaryCta(signals);
  const cta = ctaEntry
    ? ctaEntry.label_status === "VERIFIED"
      ? ctaEntry.label
      : `${ctaEntry.label} [${ctaEntry.label_status}]`
    : "Enquire for details (generic — CTA library MISSING)";

  const restrictions = signals.prohibited_claims
    ? renderCited(signals.prohibited_claims)
    : "No verified claims list — avoid guarantees, pricing, ROI promises, and unverified superlatives.";

  const lines: string[] = [
    `Draft concept for ${name} only.`,
    `Objective: ${task.objective}`,
  ];

  if (signals.description) {
    const kind = isVerifiedFact(signals.description) ? "FACT" : "OBSERVATION";
    lines.push(
      `${kind} (${signals.description.path} ${signals.description.status}): ${renderCited(signals.description)}`,
    );
  }

  if (signals.positioning_statement) {
    const kind = isVerifiedFact(signals.positioning_statement) ? "FACT" : "OBSERVATION";
    lines.push(
      `${kind} (${signals.positioning_statement.path} ${signals.positioning_statement.status}): ${renderCited(signals.positioning_statement)}`,
    );
  }

  if (signals.tone) {
    lines.push(
      `Tone guidance (${signals.tone.path} ${signals.tone.status}): ${renderCited(signals.tone)}`,
    );
  } else {
    lines.push(
      "Tone guidance: Tone MISSING — use neutral professional draft; do not invent brand voice traits.",
    );
  }

  if (signals.differentiation) {
    lines.push(
      `Operating characteristics (${signals.differentiation.path} ${signals.differentiation.status}; not superiority claims): ${renderCited(signals.differentiation)}`,
    );
  }

  const verifiedOfferings = verifiedOfferingNames(signals);
  if (verifiedOfferings.length) {
    lines.push(
      `Collection / offering categories (offerings.items.name VERIFIED; category names only, not SKU or stock): ${verifiedOfferings.join(", ")}`,
    );
  } else if (signals.offerings.length) {
    lines.push(
      `Offering names present but not VERIFIED: ${signals.offerings
        .map((item) => `${item.name} [${item.name_status}]`)
        .join(", ")}`,
    );
  }

  const verifiedAudiences = signals.audiences.filter((a) => a.label_status === "VERIFIED");
  if (verifiedAudiences.length) {
    const primary = verifiedAudiences
      .filter((a) => a.role === "PRIMARY")
      .map((a) => a.label);
    const secondary = verifiedAudiences
      .filter((a) => a.role === "SECONDARY")
      .map((a) => a.label);
    const parts = [
      primary.length ? `Primary: ${primary.join(", ")}` : "",
      secondary.length ? `Secondary: ${secondary.join(", ")}` : "",
    ].filter(Boolean);
    lines.push(
      `Audiences (audiences.segments.label VERIFIED): ${parts.join(". ")}`,
    );
  } else if (verifiedAudienceLabels(signals).length === 0 && signals.audiences.length) {
    lines.push(
      `Audiences (not VERIFIED): ${signals.audiences
        .map((a) => `${a.label} [${a.label_status}]`)
        .join(", ")}`,
    );
  }

  if (signals.markets) {
    lines.push(
      `Markets (${signals.markets.path} ${signals.markets.status}): ${renderCited(signals.markets)}`,
    );
  }

  if (signals.geographic_positioning && !isVerifiedFact(signals.geographic_positioning)) {
    lines.push(
      `Geographic positioning ${signals.geographic_positioning.status}: ${renderCited(signals.geographic_positioning)} — do not treat as exclusive market proof.`,
    );
  }

  lines.push(`CTA: ${cta}`);
  if (signals.ctas.length > 1) {
    lines.push(
      `Other pack CTAs: ${signals.ctas
        .filter((item) => item.id !== ctaEntry?.id)
        .map((item) =>
          item.label_status === "VERIFIED"
            ? item.label
            : `${item.label} [${item.label_status}]`,
        )
        .join("; ")}`,
    );
  }

  if (!signals.approved_claims) {
    lines.push(
      "Approved commercial claims: MISSING — do not invent product specs, prices, stock, materials, or certifications.",
    );
  }

  if (signals.channel_count === 0) {
    lines.push("Owned social channels: MISSING — calendar remains unschedulable.");
  }

  if (!signals.visual_kit_present) {
    lines.push("Visual kit: MISSING — do not invent a design system, colors, or materials.");
  }

  if (signals.missing_paths.length) {
    lines.push(`MISSING pack fields: ${signals.missing_paths.join(", ")}`);
  }

  lines.push("");
  lines.push("This is LEVEL_1 draft copy for internal review. Not approved for publishing.");

  return {
    headline,
    body: lines.join("\n"),
    cta,
    restrictions,
    toneKnown,
    ctaKnown,
    claimsKnown,
    missing: signals.missing_paths,
    signals,
  };
}

function draftFromProfile(
  task: Task,
  profile: BrandProfile,
): {
  headline: string;
  body: string;
  cta: unknown;
  restrictions: unknown;
  toneKnown: boolean;
  ctaKnown: boolean;
  claimsKnown: boolean;
  missing: string[];
} {
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

  return {
    headline,
    body,
    cta,
    restrictions,
    toneKnown,
    ctaKnown,
    claimsKnown,
    missing: [
      ...(!toneKnown ? ["brand.tone"] : []),
      ...(!ctaKnown ? ["brand.cta_library"] : []),
      ...(!claimsKnown ? ["brand.claims_restrictions"] : []),
    ],
  };
}

export function runContentCopy(
  task: Task,
  profile: BrandProfile,
  audit: AuditSink,
  pack?: BrandPack,
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

  const drafted = pack
    ? draftFromPack(task, profile, pack)
    : draftFromProfile(task, profile);

  const statements = [
    {
      text: "Draft copy contains no invented brand claims; MISSING fields called out.",
      kind: "OBSERVATION" as const,
      confidence: "MEDIUM" as const,
      evidence_ids: [],
    },
  ];

  if (pack && "signals" in drafted && drafted.signals) {
    const { signals } = drafted;
    if (isVerifiedFact(signals.positioning_statement)) {
      statements.push({
        text: `Positioning cited from brand pack: ${renderCitedValue(signals.positioning_statement.value)}`,
        kind: "FACT" as const,
        confidence: "VERIFIED" as const,
        evidence_ids: [],
      });
    }
    if (isVerifiedFact(signals.tone)) {
      statements.push({
        text: `Voice tone cited from brand pack: ${renderCitedValue(signals.tone.value)}`,
        kind: "FACT" as const,
        confidence: "VERIFIED" as const,
        evidence_ids: [],
      });
    }
  }

  const name = pack
    ? packDisplayName(extractPackDraftSignals(pack), profile.display_name)
    : profile.display_name;

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A05_CONTENT_COPY",
    summary: `Draft campaign messaging concepts for ${name} (internal only).`,
    deliverables: [
      {
        type: "draft_copy_pack",
        brand_id: task.brand_id,
        language: "en",
        approval_level: "LEVEL_1",
        headline: drafted.headline,
        body: drafted.body,
        cta: drafted.cta,
        invented_claims: false,
        pack_citations:
          pack && "signals" in drafted ? citedPathsUsed(drafted.signals) : [],
        compliance_notes:
          typeof drafted.restrictions === "string"
            ? drafted.restrictions
            : JSON.stringify(drafted.restrictions),
      },
    ],
    statements,
    assumptions: [
      ...(drafted.toneKnown ? [] : ["Brand tone is MISSING — draft is provisional."]),
      ...(drafted.ctaKnown ? [] : ["CTA library MISSING — generic enquiry CTA used."]),
    ],
    risks: ["Publishing this draft without Guardian + Level 2 approval is forbidden."],
    confidence: drafted.toneKnown && drafted.claimsKnown ? "MEDIUM" : "LOW",
    recommended_next_action: "Run Brand Guardian verification before any human approval request.",
    recommended_approval_level: "LEVEL_1",
    missing_information: drafted.missing,
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

import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  type AgentResult,
  type BrandProfile,
  type Evidence,
  type Task,
  listMissingKnowledge,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import type { AuditSink } from "../audit.js";
import { envForResearchAgent } from "../paid-ads-tokens.js";

export type LocalEvidenceInput = {
  summary: string;
  kind: Evidence["kind"];
  confidence: Evidence["confidence"];
  source_title?: string;
  source_url?: string;
};

/**
 * A03 Research Intelligence — Phase 1: local/supplied evidence only.
 * Does not fetch the web. Returns research_requirements when evidence is insufficient.
 */
export function runResearchIntelligence(
  task: Task,
  profile: BrandProfile,
  audit: AuditSink,
  suppliedEvidence: LocalEvidenceInput[] = [],
): AgentResult {
  const cap = assertAgentCapability(
    "A03_RESEARCH_INTELLIGENCE",
    "PRODUCE_INTERNAL_ANALYSIS",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  if (!cap.ok) {
    return AgentResultSchema.parse({
      task_id: task.task_id,
      brand_id: task.brand_id,
      agent: "A03_RESEARCH_INTELLIGENCE",
      summary: `Blocked: ${cap.reason}`,
      confidence: "LOW",
      recommended_next_action: "Resolve capability denial",
      recommended_approval_level: "LEVEL_0",
      rejected: true,
      rejection_reasons: [cap.reason],
      created_at: new Date().toISOString(),
    });
  }

  // Explicitly refuse external write / fabricate paths
  assertAgentCapability(
    "A03_RESEARCH_INTELLIGENCE",
    "LAUNCH_AD",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  assertAgentCapability(
    "A03_RESEARCH_INTELLIGENCE",
    "CHANGE_AD_BUDGET",
    audit,
    { brand_id: task.brand_id, task_id: task.task_id },
  );
  // Bound research context: ad write tokens are stripped even if process.env holds them for the ads adapter.
  const researchEnv = envForResearchAgent();
  if (
    researchEnv.META_ADS_ACCESS_TOKEN ||
    researchEnv.GOOGLE_ADS_DEVELOPER_TOKEN
  ) {
    throw new Error("Research agent received ad write tokens");
  }

  const missing = listMissingKnowledge(profile);
  const evidence: Evidence[] = suppliedEvidence.map((e, i) => ({
    id: `local-evidence-${i + 1}`,
    summary: e.summary,
    kind: e.kind,
    confidence: e.confidence,
    sources: e.source_title
      ? [
          {
            id: `src-${i + 1}`,
            title: e.source_title,
            ...(e.source_url ? { url: e.source_url } : {}),
            retrieved_at: new Date().toISOString(),
          },
        ]
      : [],
    brand_id: task.brand_id,
    collected_at: new Date().toISOString(),
  }));

  const research_requirements = [
    {
      question: `What verified market evidence supports: "${task.objective}"?`,
      reason: "No production research integrations in Phase 1; external research must be supplied or requested.",
      priority: "HIGH" as const,
    },
    ...missing.slice(0, 5).map((k) => ({
      question: `Onboard brand knowledge field: ${k}`,
      reason: `Field status is MISSING for ${profile.display_name}`,
      priority: "HIGH" as const,
    })),
  ];

  if (suppliedEvidence.length === 0) {
    research_requirements.unshift({
      question: "Provide local evidence pack or authorize later-phase external research",
      reason: "No supplied evidence — refusing to fabricate market claims",
      priority: "HIGH",
    });
  }

  const statements = [
    {
      text:
        suppliedEvidence.length === 0
          ? "No local evidence supplied. Research agent will not invent market facts."
          : `Reviewed ${suppliedEvidence.length} supplied evidence item(s).`,
      kind: "OBSERVATION" as const,
      confidence: "HIGH" as const,
      evidence_ids: evidence.map((e) => e.id),
    },
    {
      text: `External research integrations are deferred; REQUEST_EXTERNAL_RESEARCH recorded as requirements only.`,
      kind: "FACT" as const,
      confidence: "VERIFIED" as const,
      evidence_ids: [],
    },
  ];

  return AgentResultSchema.parse({
    task_id: task.task_id,
    brand_id: task.brand_id,
    agent: "A03_RESEARCH_INTELLIGENCE",
    summary:
      suppliedEvidence.length === 0
        ? `Research gap analysis for ${profile.display_name}: no fabricated findings; ${research_requirements.length} requirements logged.`
        : `Evidence review for ${profile.display_name} using ${suppliedEvidence.length} local source(s).`,
    deliverables: [
      {
        type: "research_brief",
        brand_id: task.brand_id,
        mode: "local_evidence_only",
        evidence_count: evidence.length,
        fabricated: false,
        external_fetch: false,
      },
    ],
    evidence,
    statements,
    sources: evidence.flatMap((e) => e.sources),
    assumptions: [
      "Phase 1 research does not call external APIs or scrape websites.",
    ],
    risks: [
      "Acting on strategy without external research may miss market realities.",
    ],
    confidence: evidence.length ? "MEDIUM" : "LOW",
    recommended_next_action:
      "Fulfill research_requirements or proceed with clearly labeled assumptions only.",
    recommended_approval_level: "LEVEL_0",
    missing_information: missing.map((k) => `brand.${k}`),
    research_requirements,
    capabilities_used: [
      "READ_BRAND_CONTEXT",
      "READ_RESEARCH",
      "PRODUCE_INTERNAL_ANALYSIS",
      "REQUEST_EXTERNAL_RESEARCH",
    ],
    created_at: new Date().toISOString(),
  });
}

export function createResearchTask(
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
    assigned_agent: "A03_RESEARCH_INTELLIGENCE",
    input: { objective, mode: "local_evidence_only" },
    expected_output:
      "Evidence review and/or structured research_requirements without fabrication",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "HIGH",
    approval_level: "LEVEL_0",
    status: "PENDING",
    workflow_state: "RESEARCHING",
    required_capabilities: [
      "READ_BRAND_CONTEXT",
      "PRODUCE_INTERNAL_ANALYSIS",
      "REQUEST_EXTERNAL_RESEARCH",
    ],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}

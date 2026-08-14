import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  APPROVAL_LEVEL_RANK,
  TaskSchema,
  type AgentResult,
  type BrandId,
  type BrandProfile,
  type Task,
} from "@marketing-os/contracts";
import type { AuditSink } from "../audit.js";
import { loadBrandContext } from "../brand-loader.js";
import {
  assertExecutableApprovalLevel,
  detectRequestedApprovalLevel,
} from "../capabilities.js";
import { transitionWorkflow } from "../workflow.js";
import {
  createStrategistTask,
  runBrandStrategist,
} from "./brand-strategist.js";
import { createResearchTask, runResearchIntelligence } from "./research.js";
import { createContentTask, runContentCopy } from "./content.js";
import { runBrandGuardian, type GuardianVerdict } from "./brand-guardian.js";

export type ObjectiveRequest = {
  brand_id: BrandId;
  objective: string;
  requested_by: string;
  /** Optional local evidence for A03 */
  supplied_evidence?: Parameters<typeof runResearchIntelligence>[3];
  brandsRoot?: string;
};

export type DirectorRunResult = {
  brand_id: BrandId;
  profile: BrandProfile;
  loaded_brand_ids: BrandId[];
  missing_brand_fields: string[];
  root_task: Task;
  tasks: Task[];
  results: AgentResult[];
  guardian: GuardianVerdict[];
  consolidated: AgentResult;
  requested_approval_level: ReturnType<typeof detectRequestedApprovalLevel>;
  execution_blocked: boolean;
  block_reasons: string[];
  external_side_effects: false;
  audit_event_count: number;
};

/**
 * A01 Marketing Director — orchestrates specialists; does not impersonate them.
 * Phase 1: no external side effects.
 */
export function runMarketingDirector(
  request: ObjectiveRequest,
  audit: AuditSink,
): DirectorRunResult {
  const brand_id = request.brand_id;
  const requested_approval_level = detectRequestedApprovalLevel(
    request.objective,
  );

  audit.append({
    brand_id,
    event_type: "OBJECTIVE_RECEIVED",
    message: request.objective,
    approval_level: requested_approval_level,
    metadata: { requested_by: request.requested_by },
  });

  const { profile, loaded_brand_ids, missing } = loadBrandContext(brand_id, audit, {
    ...(request.brandsRoot ? { brandsRoot: request.brandsRoot } : {}),
  });

  const block_reasons: string[] = [];
  let execution_blocked = false;

  const execCheck = assertExecutableApprovalLevel(
    requested_approval_level,
    audit,
    { brand_id, agent_id: "A01_MARKETING_DIRECTOR" },
  );
  if (!execCheck.ok) {
    execution_blocked = true;
    block_reasons.push(execCheck.reason);
  }

  const root_task = TaskSchema.parse({
    task_id: randomUUID(),
    brand_id,
    objective: request.objective,
    requested_by: request.requested_by,
    assigned_agent: "A01_MARKETING_DIRECTOR",
    input: { objective: request.objective },
    expected_output: "Consolidated campaign recommendation pack",
    dependencies: [],
    priority: "HIGH",
    approval_level: requested_approval_level,
    status: "IN_PROGRESS",
    workflow_state: "IDEA",
    required_capabilities: ["CREATE_TASK", "ROUTE_TASK", "READ_BRAND_CONTEXT"],
    created_at: new Date().toISOString(),
  });

  audit.append({
    brand_id,
    task_id: root_task.task_id,
    agent_id: "A01_MARKETING_DIRECTOR",
    event_type: "TASK_CREATED",
    message: "Root director task created",
    metadata: {},
  });

  // Advance IDEA → RESEARCHING
  const t1 = transitionWorkflow("IDEA", "RESEARCHING", {
    audit,
    brand_id,
    task_id: root_task.task_id,
    approval_level: requested_approval_level,
  });
  if (t1.ok) root_task.workflow_state = "RESEARCHING";

  const researchTask = createResearchTask(
    brand_id,
    request.objective,
    request.requested_by,
    root_task.task_id,
  );
  const strategyTask = createStrategistTask(
    brand_id,
    request.objective,
    request.requested_by,
    root_task.task_id,
  );
  const contentTask = createContentTask(
    brand_id,
    request.objective,
    request.requested_by,
    root_task.task_id,
  );

  for (const t of [researchTask, strategyTask, contentTask]) {
    audit.append({
      brand_id,
      task_id: t.task_id,
      agent_id: "A01_MARKETING_DIRECTOR",
      event_type: "TASK_ROUTED",
      message: `Routed to ${t.assigned_agent}`,
      metadata: { assigned_agent: t.assigned_agent },
    });
  }

  const researchResult = runResearchIntelligence(
    researchTask,
    profile,
    audit,
    request.supplied_evidence ?? [],
  );
  const strategyResult = runBrandStrategist(strategyTask, profile, audit);
  const contentResult = runContentCopy(contentTask, profile, audit);

  researchTask.status = "COMPLETED";
  strategyTask.status = "COMPLETED";
  contentTask.status = "COMPLETED";

  const t2 = transitionWorkflow(root_task.workflow_state, "PLANNED", {
    audit,
    brand_id,
    task_id: root_task.task_id,
  });
  if (t2.ok) root_task.workflow_state = "PLANNED";

  const t3 = transitionWorkflow(root_task.workflow_state, "IN_PRODUCTION", {
    audit,
    brand_id,
    task_id: root_task.task_id,
  });
  if (t3.ok) root_task.workflow_state = "IN_PRODUCTION";

  const t4 = transitionWorkflow(root_task.workflow_state, "QA", {
    audit,
    brand_id,
    task_id: root_task.task_id,
  });
  if (t4.ok) root_task.workflow_state = "QA";

  // Guardian reviews specialist outputs
  const guardian: GuardianVerdict[] = [
    runBrandGuardian(strategyResult, profile, audit, strategyTask),
    runBrandGuardian(researchResult, profile, audit, researchTask),
    runBrandGuardian(contentResult, profile, audit, contentTask),
  ];

  const anyRejected = guardian.some((g) => !g.passed);
  if (anyRejected) {
    transitionWorkflow(root_task.workflow_state, "REJECTED", {
      audit,
      brand_id,
      task_id: root_task.task_id,
    });
    root_task.workflow_state = "REJECTED";
    root_task.status = "BLOCKED";
  } else {
    const t5 = transitionWorkflow(root_task.workflow_state, "AWAITING_APPROVAL", {
      audit,
      brand_id,
      task_id: root_task.task_id,
      approval_level: requested_approval_level,
    });
    if (t5.ok) root_task.workflow_state = "AWAITING_APPROVAL";

    // Level 0/1 can be treated as internally approved for drafts; Level 2/3 stay awaiting
    if (
      APPROVAL_LEVEL_RANK[requested_approval_level] <=
      APPROVAL_LEVEL_RANK.LEVEL_1
    ) {
      const t6 = transitionWorkflow(root_task.workflow_state, "APPROVED", {
        audit,
        brand_id,
        task_id: root_task.task_id,
        approval_level: requested_approval_level,
      });
      if (t6.ok) {
        root_task.workflow_state = "APPROVED";
        root_task.status = "COMPLETED";
      }
    } else {
      root_task.status = "BLOCKED";
      execution_blocked = true;
      block_reasons.push(
        `Objective requires ${requested_approval_level}; Phase 1 blocks execution`,
      );
      transitionWorkflow(root_task.workflow_state, "BLOCKED", {
        audit,
        brand_id,
        task_id: root_task.task_id,
        approval_level: requested_approval_level,
      });
      root_task.workflow_state = "BLOCKED";
    }
  }

  // Never transition to PUBLISHED in Phase 1
  const publishAttempt = transitionWorkflow(
    root_task.workflow_state === "APPROVED" ? "APPROVED" : "AWAITING_APPROVAL",
    "PUBLISHED",
    {
      audit,
      brand_id,
      task_id: root_task.task_id,
      approval_level: "LEVEL_2",
      phase1: true,
    },
  );
  if (publishAttempt.ok) {
    // Should be unreachable in Phase 1
    block_reasons.push("Invariant violation: PUBLISHED transition succeeded");
    execution_blocked = true;
  }

  const results = [
    researchResult,
    strategyResult,
    contentResult,
    ...guardian.map((g) => g.result),
  ];

  const consolidated = AgentResultSchema.parse({
    task_id: root_task.task_id,
    brand_id,
    agent: "A01_MARKETING_DIRECTOR",
    summary: execution_blocked
      ? `Objective processed for ${profile.display_name} but execution blocked: ${block_reasons.join("; ")}`
      : `Consolidated Phase 1 recommendation for ${profile.display_name}: strategy + research gaps + draft messaging. Guardian ${anyRejected ? "rejected one or more outputs" : "passed"}.`,
    deliverables: [
      {
        type: "director_consolidation",
        brand_id,
        loaded_brand_ids,
        missing_brand_fields: missing,
        specialist_task_ids: [
          researchTask.task_id,
          strategyTask.task_id,
          contentTask.task_id,
        ],
        guardian_passed: !anyRejected,
        requested_approval_level,
        execution_blocked,
        external_side_effects: false,
        workflow_state: root_task.workflow_state,
      },
      ...results.flatMap((r) => r.deliverables),
    ],
    evidence: results.flatMap((r) => r.evidence),
    statements: [
      {
        text: `Only ${brand_id} brand context was loaded.`,
        kind: "FACT",
        confidence: "VERIFIED",
        evidence_ids: [],
      },
      {
        text: `Missing brand knowledge fields: ${missing.length ? missing.join(", ") : "none"}`,
        kind: "OBSERVATION",
        confidence: "HIGH",
        evidence_ids: [],
      },
      {
        text: "No external side effects were performed.",
        kind: "FACT",
        confidence: "VERIFIED",
        evidence_ids: [],
      },
    ],
    assumptions: results.flatMap((r) => r.assumptions),
    risks: [
      ...block_reasons,
      ...results.flatMap((r) => r.risks),
    ],
    confidence: missing.length > 8 ? "LOW" : "MEDIUM",
    recommended_next_action: execution_blocked
      ? "Obtain explicit human Level 2/3 approval and Phase 6/7 integrations before any external action."
      : missing.length
        ? "Run onboard-brand for MISSING fields (Phase 2), then refine strategy with supplied research evidence."
        : "Human review of Level 1 drafts; do not publish without Level 2 approval.",
    recommended_approval_level: requested_approval_level,
    missing_information: missing.map((m) => `brand.${m}`),
    research_requirements: researchResult.research_requirements,
    capabilities_used: [
      "READ_BRAND_CONTEXT",
      "CREATE_TASK",
      "ROUTE_TASK",
      "PRODUCE_INTERNAL_ANALYSIS",
      "VERIFY_OUTPUT",
    ],
    rejected: anyRejected || undefined,
    rejection_reasons: anyRejected
      ? guardian.flatMap((g) => g.reasons)
      : undefined,
    created_at: new Date().toISOString(),
  });

  audit.append({
    brand_id,
    task_id: root_task.task_id,
    agent_id: "A01_MARKETING_DIRECTOR",
    event_type: "AGENT_COMPLETED",
    message: consolidated.summary,
    approval_level: requested_approval_level,
    metadata: { execution_blocked, external_side_effects: false },
  });

  return {
    brand_id,
    profile,
    loaded_brand_ids,
    missing_brand_fields: missing,
    root_task,
    tasks: [root_task, researchTask, strategyTask, contentTask],
    results,
    guardian,
    consolidated,
    requested_approval_level,
    execution_blocked,
    block_reasons,
    external_side_effects: false,
    audit_event_count: audit.list().length,
  };
}

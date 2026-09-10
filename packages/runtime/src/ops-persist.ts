import { randomUUID } from "node:crypto";
import {
  type AgentId,
  type BrandId,
  type CampaignPack,
  type OpsApprovalRecord,
  type OpsCampaignRecord,
  type Task,
} from "@marketing-os/contracts";
import type { DirectorRunResult } from "./agents/director.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { brandsRootOpt } from "./brand-registry.js";
import {
  defaultApprovalLevel,
  slimAgentResult,
  type OpsStore,
} from "./ops-store.js";

const PACK_AGENT_FIELDS: Array<{ key: keyof CampaignPack; agent: AgentId }> = [
  { key: "research", agent: "A03_RESEARCH_INTELLIGENCE" },
  { key: "competitor", agent: "A04_COMPETITOR_INTELLIGENCE" },
  { key: "strategy", agent: "A02_BRAND_STRATEGIST" },
  { key: "paid_recommendations", agent: "A10_PAID_GROWTH" },
  { key: "social_calendar", agent: "A06_SOCIAL_MANAGER" },
];

export type PersistCampaignPackResult = {
  campaign: OpsCampaignRecord;
  task: Task;
  approval: OpsApprovalRecord | null;
};

export function persistCampaignPack(
  store: OpsStore,
  pack: CampaignPack,
  opts?: { requested_by?: string; brandsRoot?: string },
): PersistCampaignPackResult {
  assertWaveEnabled("WAVE_3_DB_PANEL", brandsRootOpt(opts?.brandsRoot));
  const brand_id = pack.brand_id;
  const now = new Date().toISOString();
  const requested_by = opts?.requested_by ?? "panel-operator";
  const campaign_id = randomUUID();

  const storedTask = store.insertTask(brand_id, {
    task_id: randomUUID(),
    brand_id,
    campaign_id,
    objective: pack.objective,
    requested_by,
    assigned_agent: "A01_MARKETING_DIRECTOR",
    input: { pack_id: pack.pack_id, objective: pack.objective },
    expected_output: "Level-1 campaign pack draft",
    dependencies: [],
    priority: "HIGH",
    approval_level: pack.approval_level_cap,
    status: pack.approvable ? "COMPLETED" : "BLOCKED",
    workflow_state: pack.approvable ? "AWAITING_APPROVAL" : "BLOCKED",
    required_capabilities: ["PRODUCE_INTERNAL_ANALYSIS"],
    created_at: now,
  });

  const campaign = store.insertCampaign(brand_id, {
    campaign_id,
    brand_id,
    pack_id: pack.pack_id,
    objective: pack.objective,
    status: pack.approvable ? "DRAFT" : "BLOCKED",
    pack,
    guardian_passed: pack.guardian.passed,
    approvable: pack.approvable,
    created_at: pack.generated_at,
    updated_at: now,
  });

  for (const { key, agent } of PACK_AGENT_FIELDS) {
    const value = pack[key];
    if (value === undefined) continue;
    store.insertAgentRun(brand_id, {
      run_id: randomUUID(),
      brand_id,
      task_id: storedTask.task_id,
      agent,
      result: slimAgentResult(value, agent),
      created_at: now,
    });
  }
  for (const draft of pack.content_drafts) {
    store.insertAgentRun(brand_id, {
      run_id: randomUUID(),
      brand_id,
      task_id: storedTask.task_id,
      agent: "A05_CONTENT_COPY",
      result: slimAgentResult(draft, "A05_CONTENT_COPY"),
      created_at: now,
    });
  }
  for (const brief of pack.creative_briefs) {
    store.insertAgentRun(brand_id, {
      run_id: randomUUID(),
      brand_id,
      task_id: storedTask.task_id,
      agent: "A07_CREATIVE_DIRECTOR",
      result: slimAgentResult(brief, "A07_CREATIVE_DIRECTOR"),
      created_at: now,
    });
  }

  let approval: OpsApprovalRecord | null = null;
  if (pack.approvable && pack.guardian.passed) {
    approval = store.insertApproval(brand_id, {
      approval_id: randomUUID(),
      brand_id,
      task_id: storedTask.task_id,
      campaign_id,
      level: defaultApprovalLevel(),
      decision: "PENDING",
      actor: requested_by,
      created_at: now,
      updated_at: now,
    });
    store.appendAudit(brand_id, {
      brand_id,
      task_id: storedTask.task_id,
      event_type: "APPROVAL_REQUIRED",
      message: `Level 1 inbox item for pack ${pack.pack_id}`,
      approval_level: "LEVEL_1",
      metadata: { campaign_id, pack_id: pack.pack_id },
    });
  }

  store.appendAudit(brand_id, {
    brand_id,
    task_id: storedTask.task_id,
    event_type: "AGENT_COMPLETED",
    message: `Campaign pack ${pack.pack_id} persisted (${pack.approvable ? "approvable" : "not approvable"})`,
    approval_level: pack.approval_level_cap,
    metadata: {
      campaign_id,
      pack_id: pack.pack_id,
      guardian_passed: pack.guardian.passed,
      live_publish: false,
      live_ads: false,
    },
  });

  return { campaign, task: storedTask, approval };
}

export function persistDirectorRun(
  store: OpsStore,
  result: DirectorRunResult,
  opts?: { brandsRoot?: string },
): { approval: OpsApprovalRecord | null } {
  assertWaveEnabled("WAVE_3_DB_PANEL", brandsRootOpt(opts?.brandsRoot));
  const brand_id = result.brand_id;
  const now = new Date().toISOString();

  for (const task of result.tasks) {
    store.insertTask(brand_id, task);
  }
  for (const agentResult of result.results) {
    store.insertAgentRun(brand_id, {
      run_id: randomUUID(),
      brand_id,
      task_id: agentResult.task_id,
      agent: agentResult.agent,
      result: slimAgentResult(agentResult, agentResult.agent),
      created_at: agentResult.created_at,
    });
  }

  const guardianPassed = result.guardian.every((g) => g.passed);
  const levelOk =
    result.requested_approval_level === "LEVEL_0" ||
    result.requested_approval_level === "LEVEL_1";

  let approval: OpsApprovalRecord | null = null;
  if (guardianPassed && levelOk && !result.execution_blocked) {
    approval = store.insertApproval(brand_id, {
      approval_id: randomUUID(),
      brand_id,
      task_id: result.root_task.task_id,
      level: result.requested_approval_level,
      decision: "PENDING",
      actor: "panel-operator",
      created_at: now,
      updated_at: now,
    });
    store.appendAudit(brand_id, {
      brand_id,
      task_id: result.root_task.task_id,
      event_type: "APPROVAL_REQUIRED",
      message: `Level ${result.requested_approval_level} inbox item for director run`,
      approval_level: result.requested_approval_level,
      metadata: { task_id: result.root_task.task_id },
    });
  }

  return { approval };
}

export function decideInboxApproval(
  store: OpsStore,
  brand_id: BrandId,
  approval_id: string,
  input: { decision: "APPROVED" | "REJECTED"; rationale: string; actor: string },
  opts?: { brandsRoot?: string },
): OpsApprovalRecord {
  assertWaveEnabled("WAVE_3_DB_PANEL", brandsRootOpt(opts?.brandsRoot));
  const updated = store.decideApproval(brand_id, approval_id, input);
  store.appendAudit(brand_id, {
    brand_id,
    ...(updated.task_id ? { task_id: updated.task_id } : {}),
    event_type: "APPROVAL_DECISION",
    message: `${input.decision} ${updated.level} (${approval_id})`,
    approval_level: updated.level,
    metadata: {
      approval_id,
      campaign_id: updated.campaign_id ?? null,
      live_publish: false,
      live_ads: false,
    },
  });
  return updated;
}

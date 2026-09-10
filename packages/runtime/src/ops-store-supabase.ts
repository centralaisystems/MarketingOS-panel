/**
 * Optional Supabase adapter for OpsStore.
 *
 * Maps the in-memory / file row shapes onto supabase/migrations/*.
 * CI and `pnpm test` stay on file/memory — this module never opens a
 * network connection unless MOS_OPS_STORE=supabase and env vars are set,
 * or a test injects an OpsRemoteClient.
 */
import {
  AdOutboxItemSchema,
  AdStagingJobSchema,
  AuditEventSchema,
  AutomationDigestRecordSchema,
  EmailOutboxItemSchema,
  LeadEventSchema,
  LeadSchema,
  OpportunitySchema,
  OpsAgentRunRecordSchema,
  OpsApprovalRecordSchema,
  OpsCampaignRecordSchema,
  OpsSnapshotSchema,
  OpsTaskRecordSchema,
  OwnerReviewDecisionSchema,
  OwnerReviewRequestSchema,
  SocialPublishOutboxRecordSchema,
  type AdOutboxItem,
  type AdStagingJob,
  type AuditEvent,
  type AutomationDigestRecord,
  type BrandId,
  type CampaignPack,
  type EmailOutboxItem,
  type Lead,
  type LeadEvent,
  type Opportunity,
  type OpsAgentRunRecord,
  type OpsApprovalRecord,
  type OpsCampaignRecord,
  type OpsCampaignStatus,
  type OpsSnapshot,
  type OpsTaskRecord,
  type OwnerReviewDecision,
  type OwnerReviewRequest,
  type OwnerReviewStatus,
  type SocialPublishOutboxRecord,
} from "@marketing-os/contracts";
import { getBrandEntry } from "./brand-registry.js";
import {
  supabaseOpsEnvError,
  supabaseOpsEnvStatus,
} from "./ops-store-backend.js";
import { MemoryOpsStore, type ApprovalDecisionInput } from "./ops-store.js";

export const OPS_REMOTE_TABLES = [
  "brands",
  "campaigns",
  "tasks",
  "approvals",
  "agent_runs",
  "audit_log",
  "owner_reviews",
  "owner_decisions",
  "email_outbox",
  "social_publish_outbox",
  "ad_outbox",
  "ad_staging_jobs",
  "leads",
  "lead_events",
  "opportunities",
  "automation_digests",
] as const;
export type OpsRemoteTable = (typeof OPS_REMOTE_TABLES)[number];

export interface OpsRemoteClient {
  upsert(
    table: OpsRemoteTable,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<void>;
  update(
    table: OpsRemoteTable,
    match: Record<string, string>,
    patch: Record<string, unknown>,
  ): Promise<void>;
  select(
    table: OpsRemoteTable,
    match?: Record<string, string>,
  ): Promise<Record<string, unknown>[]>;
  delete(
    table: OpsRemoteTable,
    match: Record<string, string>,
  ): Promise<void>;
}

function iso(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback ?? new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function omitNull<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}

export function brandRowForOps(brand_id: BrandId): {
  brand_id: string;
  slug: string;
  display_name: string;
  status: string;
} {
  try {
    const entry = getBrandEntry(brand_id);
    return {
      brand_id: entry.brand_id,
      slug: entry.slug,
      display_name: entry.display_name,
      status: entry.status,
    };
  } catch {
    return {
      brand_id,
      slug: brand_id.toLowerCase().replace(/_/g, "-"),
      display_name: brand_id,
      status: "ACTIVE",
    };
  }
}

export function campaignToRow(record: OpsCampaignRecord): Record<string, unknown> {
  return {
    campaign_id: record.campaign_id,
    brand_id: record.brand_id,
    pack_id: record.pack_id,
    objective: record.objective,
    status: record.status,
    pack: record.pack,
    guardian_passed: record.guardian_passed,
    approvable: record.approvable,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function campaignFromRow(row: Record<string, unknown>): OpsCampaignRecord {
  return OpsCampaignRecordSchema.parse({
    campaign_id: row.campaign_id,
    brand_id: row.brand_id,
    pack_id: row.pack_id,
    objective: row.objective,
    status: row.status,
    pack: row.pack,
    guardian_passed: row.guardian_passed,
    approvable: row.approvable,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at, iso(row.created_at)),
  });
}

export function taskToRow(record: OpsTaskRecord): Record<string, unknown> {
  return {
    task_id: record.task_id,
    brand_id: record.brand_id,
    campaign_id: record.campaign_id ?? null,
    objective: record.objective,
    assigned_agent: record.assigned_agent,
    workflow_state: record.workflow_state,
    approval_level: record.approval_level,
    status: record.status,
    payload: record.input,
    extras: {
      requested_by: record.requested_by,
      expected_output: record.expected_output,
      dependencies: record.dependencies,
      priority: record.priority,
      required_capabilities: record.required_capabilities,
      due_at: record.due_at ?? null,
      parent_task_id: record.parent_task_id ?? null,
    },
    created_at: record.created_at,
  };
}

export function taskFromRow(row: Record<string, unknown>): OpsTaskRecord {
  const extras = asRecord(row.extras);
  return OpsTaskRecordSchema.parse({
    task_id: row.task_id,
    brand_id: row.brand_id,
    ...(typeof row.campaign_id === "string" ? { campaign_id: row.campaign_id } : {}),
    objective: row.objective,
    requested_by:
      typeof extras.requested_by === "string" ? extras.requested_by : "ops-store",
    assigned_agent: row.assigned_agent,
    input: asRecord(row.payload),
    expected_output:
      typeof extras.expected_output === "string"
        ? extras.expected_output
        : "persisted task",
    dependencies: Array.isArray(extras.dependencies) ? extras.dependencies : [],
    priority: extras.priority ?? "MEDIUM",
    approval_level: row.approval_level,
    status: row.status,
    workflow_state: row.workflow_state,
    required_capabilities: Array.isArray(extras.required_capabilities)
      ? extras.required_capabilities
      : [],
    created_at: iso(row.created_at),
    ...(typeof extras.due_at === "string" ? { due_at: extras.due_at } : {}),
    ...(typeof extras.parent_task_id === "string"
      ? { parent_task_id: extras.parent_task_id }
      : {}),
  });
}

export function approvalToRow(record: OpsApprovalRecord): Record<string, unknown> {
  return {
    approval_id: record.approval_id,
    brand_id: record.brand_id,
    task_id: record.task_id ?? null,
    campaign_id: record.campaign_id ?? null,
    level: record.level,
    decision: record.decision,
    rationale: record.rationale ?? null,
    actor: record.actor ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function approvalFromRow(row: Record<string, unknown>): OpsApprovalRecord {
  return OpsApprovalRecordSchema.parse(
    omitNull({
      approval_id: row.approval_id,
      brand_id: row.brand_id,
      task_id: row.task_id,
      campaign_id: row.campaign_id,
      level: row.level,
      decision: row.decision,
      rationale: row.rationale,
      actor: row.actor,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at, iso(row.created_at)),
    }),
  );
}

export function agentRunToRow(record: OpsAgentRunRecord): Record<string, unknown> {
  return {
    run_id: record.run_id,
    brand_id: record.brand_id,
    task_id: record.task_id ?? null,
    agent: record.agent,
    result: record.result,
    created_at: record.created_at,
  };
}

export function agentRunFromRow(row: Record<string, unknown>): OpsAgentRunRecord {
  return OpsAgentRunRecordSchema.parse(
    omitNull({
      run_id: row.run_id,
      brand_id: row.brand_id,
      task_id: row.task_id,
      agent: row.agent,
      result: asRecord(row.result),
      created_at: iso(row.created_at),
    }),
  );
}

export function auditToRow(record: AuditEvent): Record<string, unknown> {
  return {
    event_id: record.event_id,
    brand_id: record.brand_id,
    event_type: record.event_type,
    message: record.message,
    metadata: record.metadata,
    extras: {
      agent_id: record.agent_id ?? null,
      task_id: record.task_id ?? null,
      operator_id: record.operator_id ?? null,
      approval_level: record.approval_level ?? null,
      capability: record.capability ?? null,
    },
    created_at: record.timestamp,
  };
}

export function auditFromRow(row: Record<string, unknown>): AuditEvent {
  const extras = asRecord(row.extras);
  return AuditEventSchema.parse(
    omitNull({
      event_id: row.event_id,
      brand_id: row.brand_id,
      agent_id: extras.agent_id,
      task_id: extras.task_id ?? row.task_id,
      operator_id: extras.operator_id,
      event_type: row.event_type,
      message: row.message,
      approval_level: extras.approval_level,
      capability: extras.capability,
      metadata: asRecord(row.metadata),
      timestamp: iso(row.created_at ?? row.timestamp),
    }),
  );
}

export function ownerReviewToRow(record: OwnerReviewRequest): Record<string, unknown> {
  return {
    review_id: record.review_id,
    brand_id: record.brand_id,
    campaign_id: record.campaign_id,
    pack_id: record.pack_id,
    approval_id: record.approval_id ?? null,
    token: record.token,
    status: record.status,
    review_url: record.review_url,
    template: record.template,
    extras: {
      arranged_asset_ids: record.arranged_asset_ids,
      figma_job_ids: record.figma_job_ids,
      generated_asset_ids: record.generated_asset_ids,
      higgsfield_job_ids: record.higgsfield_job_ids,
      video_asset_ids: record.video_asset_ids,
      video_job_ids: record.video_job_ids,
    },
    created_at: record.created_at,
    decided_at: record.decided_at ?? null,
  };
}

export function ownerReviewFromRow(row: Record<string, unknown>): OwnerReviewRequest {
  const extras = asRecord(row.extras);
  return OwnerReviewRequestSchema.parse(
    omitNull({
      review_id: row.review_id,
      brand_id: row.brand_id,
      campaign_id: row.campaign_id,
      pack_id: row.pack_id,
      approval_id: row.approval_id,
      token: row.token,
      status: row.status,
      review_url: row.review_url,
      template: row.template ?? "MATERIALS_READY",
      arranged_asset_ids: extras.arranged_asset_ids ?? [],
      figma_job_ids: extras.figma_job_ids ?? [],
      generated_asset_ids: extras.generated_asset_ids ?? [],
      higgsfield_job_ids: extras.higgsfield_job_ids ?? [],
      video_asset_ids: extras.video_asset_ids ?? [],
      video_job_ids: extras.video_job_ids ?? [],
      created_at: iso(row.created_at),
      decided_at: row.decided_at ? iso(row.decided_at) : undefined,
    }),
  );
}

export function ownerDecisionToRow(
  record: OwnerReviewDecision,
): Record<string, unknown> {
  return {
    decision_id: record.decision_id,
    review_id: record.review_id,
    brand_id: record.brand_id,
    decision: record.decision,
    note: record.note,
    actor: record.actor,
    revision_task_id: record.revision_task_id ?? null,
    guardian: record.guardian ?? null,
    extras: {
      live_publish: false,
      live_ads: false,
    },
    created_at: record.created_at,
  };
}

export function ownerDecisionFromRow(
  row: Record<string, unknown>,
): OwnerReviewDecision {
  return OwnerReviewDecisionSchema.parse(
    omitNull({
      decision_id: row.decision_id,
      review_id: row.review_id,
      brand_id: row.brand_id,
      decision: row.decision,
      note: row.note ?? "",
      actor: row.actor,
      created_at: iso(row.created_at),
      revision_task_id: row.revision_task_id,
      guardian: row.guardian,
      live_publish: false,
      live_ads: false,
    }),
  );
}

export function emailOutboxToRow(record: EmailOutboxItem): Record<string, unknown> {
  return {
    outbox_id: record.outbox_id,
    brand_id: record.brand_id,
    template: record.template,
    mode: record.mode,
    payload: record.payload,
    extras: {
      to: record.to,
      cc: record.cc,
      subject: record.subject,
      text_body: record.text_body,
      html_body: record.html_body,
      review_url: record.review_url ?? null,
      review_id: record.review_id ?? null,
      campaign_id: record.campaign_id ?? null,
      pack_id: record.pack_id ?? null,
      provider_message_id: record.provider_message_id ?? null,
    },
    status: record.status,
    live_publish: false,
    live_ads: false,
    created_at: record.created_at,
  };
}

export function emailOutboxFromRow(row: Record<string, unknown>): EmailOutboxItem {
  const extras = asRecord(row.extras);
  return EmailOutboxItemSchema.parse(
    omitNull({
      outbox_id: row.outbox_id,
      brand_id: row.brand_id,
      template: row.template,
      mode: row.mode,
      to: extras.to ?? ["ops@example.test"],
      cc: extras.cc ?? [],
      subject: extras.subject ?? String(row.template ?? "email"),
      text_body: extras.text_body ?? "Recorded outbox item",
      html_body: extras.html_body ?? "<p>Recorded outbox item</p>",
      review_url: extras.review_url,
      review_id: extras.review_id,
      campaign_id: extras.campaign_id,
      pack_id: extras.pack_id,
      payload: asRecord(row.payload),
      status: row.status,
      live_publish: false,
      live_ads: false,
      created_at: iso(row.created_at),
      provider_message_id: extras.provider_message_id,
    }),
  );
}

export function socialOutboxToRow(
  record: SocialPublishOutboxRecord,
): Record<string, unknown> {
  return {
    outbox_id: record.outbox_id,
    brand_id: record.brand_id,
    channel: record.channel,
    mode: record.mode,
    status: record.status,
    caption: record.caption,
    campaign_id: record.campaign_id,
    pack_id: record.pack_id,
    calendar_item_key: record.calendar_item_key,
    intended_payload: record.intended_payload,
    extras: {
      dry_run: record.dry_run,
      would_publish: record.would_publish,
      scheduled_at: record.scheduled_at ?? null,
      asset_ids: record.asset_ids,
      approval_id: record.approval_id ?? null,
      approval_level: record.approval_level ?? null,
      live_publish_allowed: false,
      external_side_effects: false,
    },
    actor: record.actor,
    rationale: record.rationale,
    approval_id: record.approval_id ?? null,
    live_publish: false,
    live_ads: false,
    created_at: record.created_at,
  };
}

export function socialOutboxFromRow(
  row: Record<string, unknown>,
): SocialPublishOutboxRecord {
  const extras = asRecord(row.extras);
  return SocialPublishOutboxRecordSchema.parse(
    omitNull({
      outbox_id: row.outbox_id,
      brand_id: row.brand_id,
      channel: row.channel,
      mode: row.mode,
      status: row.status,
      dry_run: extras.dry_run ?? true,
      would_publish: extras.would_publish ?? true,
      caption: row.caption,
      scheduled_at: extras.scheduled_at,
      asset_ids: extras.asset_ids ?? [],
      campaign_id: row.campaign_id,
      pack_id: row.pack_id,
      calendar_item_key: row.calendar_item_key,
      intended_payload: row.intended_payload,
      actor: row.actor,
      rationale: row.rationale,
      approval_id: row.approval_id ?? extras.approval_id,
      approval_level: extras.approval_level,
      live_publish_allowed: false,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
      created_at: iso(row.created_at),
    }),
  );
}

export function adOutboxToRow(record: AdOutboxItem): Record<string, unknown> {
  return {
    outbox_id: record.outbox_id,
    brand_id: record.brand_id,
    platform: record.platform,
    action: record.action,
    mode: record.mode,
    status: record.status,
    campaign_id: record.campaign_id,
    pack_id: record.pack_id,
    campaign_draft: record.campaign_draft,
    budget: record.budget,
    extras: {
      staging: record.staging,
      would_launch: record.would_launch,
      would_mutate_budget: false,
      recommendation: record.recommendation ?? null,
      approval_level: record.approval_level ?? null,
      live_ads_allowed: false,
      live_publish: false,
      external_side_effects: false,
    },
    actor: record.actor,
    rationale: record.rationale,
    approval_id: record.approval_id ?? null,
    live_ads: false,
    created_at: record.created_at,
  };
}

export function adOutboxFromRow(row: Record<string, unknown>): AdOutboxItem {
  const extras = asRecord(row.extras);
  return AdOutboxItemSchema.parse(
    omitNull({
      outbox_id: row.outbox_id,
      brand_id: row.brand_id,
      platform: row.platform,
      action: row.action,
      mode: row.mode,
      status: row.status,
      staging: extras.staging ?? true,
      would_launch: extras.would_launch ?? true,
      would_mutate_budget: false,
      campaign_id: row.campaign_id,
      pack_id: row.pack_id,
      campaign_draft: row.campaign_draft,
      budget: row.budget,
      recommendation: extras.recommendation,
      actor: row.actor,
      rationale: row.rationale,
      approval_id: row.approval_id,
      approval_level: extras.approval_level,
      live_ads_allowed: false,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
      created_at: iso(row.created_at),
    }),
  );
}

export function adJobToRow(record: AdStagingJob): Record<string, unknown> {
  return {
    job_id: record.job_id,
    brand_id: record.brand_id,
    platform: record.platform,
    action: record.action,
    mode: record.mode,
    status: record.status,
    campaign_id: record.campaign_id,
    pack_id: record.pack_id,
    outbox_id: record.outbox_id,
    campaign_draft: record.campaign_draft,
    budget: record.budget,
    extras: {
      live_ads_allowed: false,
      live_publish: false,
      external_side_effects: false,
    },
    actor: record.actor,
    rationale: record.rationale,
    live_ads: false,
    created_at: record.created_at,
  };
}

export function adJobFromRow(row: Record<string, unknown>): AdStagingJob {
  return AdStagingJobSchema.parse(
    omitNull({
      job_id: row.job_id,
      brand_id: row.brand_id,
      platform: row.platform,
      action: row.action,
      mode: row.mode,
      status: row.status,
      campaign_id: row.campaign_id,
      pack_id: row.pack_id,
      outbox_id: row.outbox_id,
      campaign_draft: row.campaign_draft,
      budget: row.budget,
      actor: row.actor,
      rationale: row.rationale,
      live_ads_allowed: false,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
      created_at: iso(row.created_at),
    }),
  );
}

export function leadToRow(record: Lead): Record<string, unknown> {
  return {
    lead_id: record.lead_id,
    brand_id: record.brand_id,
    pii_ref: record.pii_ref,
    source: record.source,
    campaign_id: record.campaign_id ?? null,
    utm: record.utm ?? {},
    stage: record.stage,
    created_at: record.created_at,
    updated_at: record.updated_at ?? record.created_at,
  };
}

export function leadFromRow(row: Record<string, unknown>): Lead {
  return LeadSchema.parse(
    omitNull({
      lead_id: row.lead_id,
      brand_id: row.brand_id,
      pii_ref: row.pii_ref,
      source: row.source,
      campaign_id: row.campaign_id,
      utm: row.utm && Object.keys(asRecord(row.utm)).length ? row.utm : undefined,
      stage: row.stage,
      created_at: iso(row.created_at),
      updated_at: row.updated_at ? iso(row.updated_at) : undefined,
    }),
  );
}

export function leadEventToRow(record: LeadEvent): Record<string, unknown> {
  return {
    event_id: record.event_id,
    brand_id: record.brand_id,
    lead_id: record.lead_id,
    pii_ref: record.pii_ref,
    kind: record.kind,
    source: record.source ?? null,
    campaign_id: record.campaign_id ?? null,
    utm: record.utm ?? {},
    message: record.message ?? null,
    created_at: record.created_at,
  };
}

export function leadEventFromRow(row: Record<string, unknown>): LeadEvent {
  return LeadEventSchema.parse(
    omitNull({
      event_id: row.event_id,
      brand_id: row.brand_id,
      lead_id: row.lead_id,
      pii_ref: row.pii_ref,
      kind: row.kind,
      source: row.source,
      campaign_id: row.campaign_id,
      utm: row.utm && Object.keys(asRecord(row.utm)).length ? row.utm : undefined,
      message: row.message,
      created_at: iso(row.created_at),
    }),
  );
}

export function opportunityToRow(record: Opportunity): Record<string, unknown> {
  return {
    opportunity_id: record.opportunity_id,
    brand_id: record.brand_id,
    lead_id: record.lead_id,
    pii_ref: record.pii_ref,
    campaign_id: record.campaign_id ?? null,
    stage: record.stage,
    created_at: record.created_at,
  };
}

export function opportunityFromRow(row: Record<string, unknown>): Opportunity {
  return OpportunitySchema.parse(
    omitNull({
      opportunity_id: row.opportunity_id,
      brand_id: row.brand_id,
      lead_id: row.lead_id,
      pii_ref: row.pii_ref,
      campaign_id: row.campaign_id,
      stage: row.stage,
      created_at: iso(row.created_at),
    }),
  );
}

export function digestToRow(record: AutomationDigestRecord): Record<string, unknown> {
  return {
    digest_id: record.digest_id,
    brand_id: record.brand_id,
    period: record.period,
    generated_at: record.generated_at,
    window_start: record.window_start,
    window_end: record.window_end,
    status: record.status,
    blocked_reason: record.blocked_reason ?? null,
    email_outbox_id: record.email_outbox_id ?? null,
    summary: record.summary,
    analytics: record.analytics,
    costs: record.costs,
    live_publish: false,
    live_ads: false,
    created_at: record.created_at,
  };
}

export function digestFromRow(row: Record<string, unknown>): AutomationDigestRecord {
  return AutomationDigestRecordSchema.parse(
    omitNull({
      digest_id: row.digest_id,
      brand_id: row.brand_id,
      period: row.period,
      generated_at: iso(row.generated_at),
      window_start: iso(row.window_start),
      window_end: iso(row.window_end),
      status: row.status,
      blocked_reason: row.blocked_reason,
      email_outbox_id: row.email_outbox_id,
      summary: row.summary,
      analytics: row.analytics,
      costs: row.costs,
      live_publish: false,
      live_ads: false,
      created_at: iso(row.created_at, iso(row.generated_at)),
    }),
  );
}

/** In-memory PostgREST stand-in — used by tests, never talks to the network. */
export class MemoryOpsRemoteClient implements OpsRemoteClient {
  readonly tables = new Map<OpsRemoteTable, Record<string, unknown>[]>();

  constructor() {
    for (const table of OPS_REMOTE_TABLES) {
      this.tables.set(table, []);
    }
  }

  async upsert(
    table: OpsRemoteTable,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<void> {
    const rows = this.tables.get(table) ?? [];
    const keys = onConflict.split(",").map((k) => k.trim());
    const idx = rows.findIndex((existing) =>
      keys.every((key) => existing[key] === row[key]),
    );
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...row };
    } else {
      rows.push({ ...row });
    }
    this.tables.set(table, rows);
  }

  async update(
    table: OpsRemoteTable,
    match: Record<string, string>,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const rows = this.tables.get(table) ?? [];
    this.tables.set(
      table,
      rows.map((row) =>
        Object.entries(match).every(([k, v]) => row[k] === v)
          ? { ...row, ...patch }
          : row,
      ),
    );
  }

  async select(
    table: OpsRemoteTable,
    match?: Record<string, string>,
  ): Promise<Record<string, unknown>[]> {
    const rows = this.tables.get(table) ?? [];
    if (!match) return rows.map((r) => ({ ...r }));
    return rows
      .filter((row) => Object.entries(match).every(([k, v]) => row[k] === v))
      .map((r) => ({ ...r }));
  }

  async delete(
    table: OpsRemoteTable,
    match: Record<string, string>,
  ): Promise<void> {
    const rows = this.tables.get(table) ?? [];
    this.tables.set(
      table,
      rows.filter((row) => !Object.entries(match).every(([k, v]) => row[k] === v)),
    );
  }
}

function encodeEq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/**
 * PostgREST client for a provisioned Supabase project.
 * Uses the service role and still filters by brand_id in application code
 * (same contract as MemoryOpsStore / FileOpsStore).
 */
export class SupabaseRestClient implements OpsRemoteClient {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(prefer?: string): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    };
  }

  private async request(
    method: string,
    path: string,
    opts?: { body?: unknown; prefer?: string },
  ): Promise<unknown> {
    const res = await this.fetchImpl(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      method,
      headers: this.headers(opts?.prefer),
      ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Supabase REST ${method} ${path} failed (${res.status}): ${text.slice(0, 400)}`,
      );
    }
    if (!text) return null;
    return JSON.parse(text) as unknown;
  }

  async upsert(
    table: OpsRemoteTable,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        body: row,
        prefer: "resolution=merge-duplicates,return=minimal",
      },
    );
  }

  async update(
    table: OpsRemoteTable,
    match: Record<string, string>,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const qs = Object.entries(match)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeEq(v)}`)
      .join("&");
    await this.request("PATCH", `${table}?${qs}`, {
      body: patch,
      prefer: "return=minimal",
    });
  }

  async select(
    table: OpsRemoteTable,
    match?: Record<string, string>,
  ): Promise<Record<string, unknown>[]> {
    const parts = ["select=*"];
    if (match) {
      for (const [k, v] of Object.entries(match)) {
        parts.push(`${encodeURIComponent(k)}=${encodeEq(v)}`);
      }
    }
    const raw = await this.request("GET", `${table}?${parts.join("&")}`);
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  }

  async delete(
    table: OpsRemoteTable,
    match: Record<string, string>,
  ): Promise<void> {
    const qs = Object.entries(match)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeEq(v)}`)
      .join("&");
    await this.request("DELETE", `${table}?${qs}`, {
      prefer: "return=minimal",
    });
  }
}

export function createSupabaseOpsRemoteFromEnv(
  fetchImpl?: typeof fetch,
): OpsRemoteClient {
  const { configured } = supabaseOpsEnvStatus();
  if (!configured) throw supabaseOpsEnvError();
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return new SupabaseRestClient(url, key, fetchImpl ?? fetch);
}

/**
 * Write-through OpsStore: memory replica for sync reads + queued Supabase upserts.
 * Call `flush()` after a request (panel does this automatically).
 */
export class SupabaseOpsStore extends MemoryOpsStore {
  private pending: Promise<void>[] = [];

  constructor(private readonly remote: OpsRemoteClient) {
    super();
  }

  static async connect(remote: OpsRemoteClient): Promise<SupabaseOpsStore> {
    const store = new SupabaseOpsStore(remote);
    await store.hydrate();
    return store;
  }

  private enqueue(op: () => Promise<void>): void {
    this.pending.push(op());
  }

  private ensureBrand(brand_id: BrandId): void {
    const row = brandRowForOps(brand_id);
    this.enqueue(() => this.remote.upsert("brands", row, "brand_id"));
  }

  async flush(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    await Promise.all(batch);
  }

  async hydrate(): Promise<void> {
    const [
      campaigns,
      tasks,
      approvals,
      agentRuns,
      auditLog,
      ownerReviews,
      ownerDecisions,
      emailOutbox,
      socialOutbox,
      adOutbox,
      adStagingJobs,
      leads,
      leadEvents,
      opportunities,
      automationDigests,
    ] = await Promise.all([
      this.remote.select("campaigns"),
      this.remote.select("tasks"),
      this.remote.select("approvals"),
      this.remote.select("agent_runs"),
      this.remote.select("audit_log"),
      this.remote.select("owner_reviews"),
      this.remote.select("owner_decisions"),
      this.remote.select("email_outbox"),
      this.remote.select("social_publish_outbox"),
      this.remote.select("ad_outbox"),
      this.remote.select("ad_staging_jobs"),
      this.remote.select("leads"),
      this.remote.select("lead_events"),
      this.remote.select("opportunities"),
      this.remote.select("automation_digests"),
    ]);
    this.campaigns = campaigns.map(campaignFromRow);
    this.tasks = tasks.map(taskFromRow);
    this.approvals = approvals.map(approvalFromRow);
    this.agentRuns = agentRuns.map(agentRunFromRow);
    this.auditLog = auditLog.map(auditFromRow);
    this.ownerReviews = ownerReviews.map(ownerReviewFromRow);
    this.ownerDecisions = ownerDecisions.map(ownerDecisionFromRow);
    this.emailOutbox = emailOutbox.map(emailOutboxFromRow);
    this.socialOutbox = socialOutbox.map(socialOutboxFromRow);
    this.adOutbox = adOutbox.map(adOutboxFromRow);
    this.adStagingJobs = adStagingJobs.map(adJobFromRow);
    this.leads = leads.map(leadFromRow);
    this.leadEvents = leadEvents.map(leadEventFromRow);
    this.opportunities = opportunities.map(opportunityFromRow);
    this.automationDigests = automationDigests.map(digestFromRow);
  }

  override insertCampaign(brand_id: BrandId, record: OpsCampaignRecord): OpsCampaignRecord {
    const row = super.insertCampaign(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("campaigns", campaignToRow(row), "campaign_id"));
    return row;
  }

  override updateCampaignStatus(
    brand_id: BrandId,
    campaign_id: string,
    status: OpsCampaignStatus,
  ): OpsCampaignRecord | null {
    const row = super.updateCampaignStatus(brand_id, campaign_id, status);
    if (row) {
      this.enqueue(() => this.remote.upsert("campaigns", campaignToRow(row), "campaign_id"));
    }
    return row;
  }

  override patchCampaign(
    brand_id: BrandId,
    campaign_id: string,
    patch: {
      status?: OpsCampaignStatus;
      pack?: CampaignPack;
      guardian_passed?: boolean;
      approvable?: boolean;
    },
  ): OpsCampaignRecord | null {
    const row = super.patchCampaign(brand_id, campaign_id, patch);
    if (row) {
      this.enqueue(() => this.remote.upsert("campaigns", campaignToRow(row), "campaign_id"));
    }
    return row;
  }

  override insertTask(brand_id: BrandId, record: OpsTaskRecord): OpsTaskRecord {
    const row = super.insertTask(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("tasks", taskToRow(row), "task_id"));
    return row;
  }

  override insertApproval(brand_id: BrandId, record: OpsApprovalRecord): OpsApprovalRecord {
    const row = super.insertApproval(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("approvals", approvalToRow(row), "approval_id"));
    return row;
  }

  override decideApproval(
    brand_id: BrandId,
    approval_id: string,
    input: ApprovalDecisionInput,
  ): OpsApprovalRecord {
    const row = super.decideApproval(brand_id, approval_id, input);
    this.enqueue(() => this.remote.upsert("approvals", approvalToRow(row), "approval_id"));
    if (row.campaign_id) {
      const campaign = this.getCampaign(brand_id, row.campaign_id);
      if (campaign) {
        this.enqueue(() =>
          this.remote.upsert("campaigns", campaignToRow(campaign), "campaign_id"),
        );
      }
    }
    return row;
  }

  override insertAgentRun(brand_id: BrandId, record: OpsAgentRunRecord): OpsAgentRunRecord {
    const row = super.insertAgentRun(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("agent_runs", agentRunToRow(row), "run_id"));
    return row;
  }

  override appendAudit(
    brand_id: BrandId,
    event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    const row = super.appendAudit(brand_id, event);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("audit_log", auditToRow(row), "event_id"));
    return row;
  }

  override clearAudit(brand_id: BrandId): void {
    super.clearAudit(brand_id);
    this.enqueue(() => this.remote.delete("audit_log", { brand_id }));
  }

  override insertOwnerReview(
    brand_id: BrandId,
    record: OwnerReviewRequest,
  ): OwnerReviewRequest {
    const row = super.insertOwnerReview(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("owner_reviews", ownerReviewToRow(row), "review_id"),
    );
    return row;
  }

  override updateOwnerReview(
    brand_id: BrandId,
    review_id: string,
    patch: { status: OwnerReviewStatus; decided_at?: string },
  ): OwnerReviewRequest | null {
    const row = super.updateOwnerReview(brand_id, review_id, patch);
    if (row) {
      this.enqueue(() =>
        this.remote.upsert("owner_reviews", ownerReviewToRow(row), "review_id"),
      );
    }
    return row;
  }

  override insertOwnerDecision(
    brand_id: BrandId,
    record: OwnerReviewDecision,
  ): OwnerReviewDecision {
    const row = super.insertOwnerDecision(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("owner_decisions", ownerDecisionToRow(row), "decision_id"),
    );
    return row;
  }

  override insertOutboxItem(brand_id: BrandId, record: EmailOutboxItem): EmailOutboxItem {
    const row = super.insertOutboxItem(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("email_outbox", emailOutboxToRow(row), "outbox_id"),
    );
    return row;
  }

  override insertSocialOutbox(
    brand_id: BrandId,
    record: SocialPublishOutboxRecord,
  ): SocialPublishOutboxRecord {
    const row = super.insertSocialOutbox(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("social_publish_outbox", socialOutboxToRow(row), "outbox_id"),
    );
    return row;
  }

  override insertAdOutbox(brand_id: BrandId, record: AdOutboxItem): AdOutboxItem {
    const row = super.insertAdOutbox(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("ad_outbox", adOutboxToRow(row), "outbox_id"));
    return row;
  }

  override insertAdStagingJob(brand_id: BrandId, record: AdStagingJob): AdStagingJob {
    const row = super.insertAdStagingJob(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("ad_staging_jobs", adJobToRow(row), "job_id"),
    );
    return row;
  }

  override insertLead(brand_id: BrandId, record: Lead): Lead {
    const row = super.insertLead(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("leads", leadToRow(row), "lead_id"));
    return row;
  }

  override insertLeadEvent(brand_id: BrandId, record: LeadEvent): LeadEvent {
    const row = super.insertLeadEvent(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() => this.remote.upsert("lead_events", leadEventToRow(row), "event_id"));
    return row;
  }

  override insertOpportunity(brand_id: BrandId, record: Opportunity): Opportunity {
    const row = super.insertOpportunity(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("opportunities", opportunityToRow(row), "opportunity_id"),
    );
    return row;
  }

  override insertAutomationDigest(
    brand_id: BrandId,
    record: AutomationDigestRecord,
  ): AutomationDigestRecord {
    const row = super.insertAutomationDigest(brand_id, record);
    this.ensureBrand(brand_id);
    this.enqueue(() =>
      this.remote.upsert("automation_digests", digestToRow(row), "digest_id"),
    );
    return row;
  }

  /** Test helper — snapshot after hydrate / local writes. */
  override exportSnapshot(): OpsSnapshot {
    return OpsSnapshotSchema.parse(super.exportSnapshot());
  }
}

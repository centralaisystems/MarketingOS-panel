import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  APPROVAL_LEVEL_RANK,
  AuditEventSchema,
  EmailOutboxItemSchema,
  OpsAgentRunRecordSchema,
  OpsApprovalRecordSchema,
  OpsCampaignRecordSchema,
  OpsSnapshotSchema,
  OpsTaskRecordSchema,
  OwnerReviewDecisionSchema,
  OwnerReviewRequestSchema,
  PHASE1_MAX_EXECUTABLE_LEVEL,
  type AgentId,
  type ApprovalLevel,
  type AuditEvent,
  type BrandId,
  type CampaignPack,
  type EmailOutboxItem,
  type OpsAgentRunRecord,
  type OpsApprovalDecision,
  type OpsApprovalRecord,
  type OpsCampaignRecord,
  type OpsCampaignStatus,
  type OpsCampaignSummary,
  type OpsSnapshot,
  type OpsTaskRecord,
  type OwnerReviewDecision,
  type OwnerReviewRequest,
  type OwnerReviewStatus,
} from "@marketing-os/contracts";
import type { AuditSink } from "./audit.js";
import { BrandIsolationError } from "./brand-loader.js";

const DEFAULT_LIST_LIMIT = 50;

export class CrossBrandDeniedError extends BrandIsolationError {
  readonly code = "CROSS_BRAND_DENIED" as const;
  constructor(
    public readonly active_brand_id: BrandId,
    public readonly foreign_brand_id?: BrandId,
  ) {
    super(
      foreign_brand_id
        ? `Cross-brand access denied: active=${active_brand_id} foreign=${foreign_brand_id}`
        : `Cross-brand access denied for ${active_brand_id}`,
    );
    this.name = "CrossBrandDeniedError";
  }
}

export type ApprovalDecisionInput = {
  decision: Extract<OpsApprovalDecision, "APPROVED" | "REJECTED">;
  rationale: string;
  actor: string;
};

export interface OpsStore {
  insertCampaign(brand_id: BrandId, record: OpsCampaignRecord): OpsCampaignRecord;
  listCampaigns(brand_id: BrandId, opts?: { limit?: number }): OpsCampaignSummary[];
  getCampaign(brand_id: BrandId, campaign_id: string): OpsCampaignRecord | null;
  updateCampaignStatus(
    brand_id: BrandId,
    campaign_id: string,
    status: OpsCampaignStatus,
  ): OpsCampaignRecord | null;

  insertTask(brand_id: BrandId, record: OpsTaskRecord): OpsTaskRecord;
  listTasks(brand_id: BrandId, opts?: { limit?: number }): OpsTaskRecord[];

  insertApproval(brand_id: BrandId, record: OpsApprovalRecord): OpsApprovalRecord;
  listApprovals(
    brand_id: BrandId,
    opts?: { inboxOnly?: boolean; limit?: number },
  ): OpsApprovalRecord[];
  getApproval(brand_id: BrandId, approval_id: string): OpsApprovalRecord | null;
  decideApproval(
    brand_id: BrandId,
    approval_id: string,
    input: ApprovalDecisionInput,
  ): OpsApprovalRecord;

  insertAgentRun(brand_id: BrandId, record: OpsAgentRunRecord): OpsAgentRunRecord;
  listAgentRuns(brand_id: BrandId, opts?: { limit?: number }): OpsAgentRunRecord[];

  appendAudit(
    brand_id: BrandId,
    event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent;
  listAudit(
    brand_id: BrandId,
    opts?: { limit?: number; task_id?: string },
  ): AuditEvent[];
  clearAudit(brand_id: BrandId): void;

  patchCampaign(
    brand_id: BrandId,
    campaign_id: string,
    patch: {
      status?: OpsCampaignStatus;
      pack?: CampaignPack;
      guardian_passed?: boolean;
      approvable?: boolean;
    },
  ): OpsCampaignRecord | null;

  insertOwnerReview(brand_id: BrandId, record: OwnerReviewRequest): OwnerReviewRequest;
  listOwnerReviews(brand_id: BrandId, opts?: { limit?: number }): OwnerReviewRequest[];
  getOwnerReview(brand_id: BrandId, review_id: string): OwnerReviewRequest | null;
  getOwnerReviewByToken(token: string): OwnerReviewRequest | null;
  updateOwnerReview(
    brand_id: BrandId,
    review_id: string,
    patch: { status: OwnerReviewStatus; decided_at?: string },
  ): OwnerReviewRequest | null;

  insertOwnerDecision(
    brand_id: BrandId,
    record: OwnerReviewDecision,
  ): OwnerReviewDecision;
  listOwnerDecisions(brand_id: BrandId, opts?: { limit?: number }): OwnerReviewDecision[];

  insertOutboxItem(brand_id: BrandId, record: EmailOutboxItem): EmailOutboxItem;
  listOutbox(brand_id: BrandId, opts?: { limit?: number }): EmailOutboxItem[];
}

function assertSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

function newestFirst<T extends { created_at?: string; timestamp?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aKey = a.created_at ?? a.timestamp ?? "";
    const bKey = b.created_at ?? b.timestamp ?? "";
    return aKey < bKey ? 1 : -1;
  });
}

function toSummary(record: OpsCampaignRecord): OpsCampaignSummary {
  const { pack: _pack, ...summary } = record;
  return summary;
}

function inboxEligible(row: OpsApprovalRecord): boolean {
  return (
    row.decision === "PENDING" &&
    APPROVAL_LEVEL_RANK[row.level] <= APPROVAL_LEVEL_RANK[PHASE1_MAX_EXECUTABLE_LEVEL]
  );
}

export class MemoryOpsStore implements OpsStore {
  protected campaigns: OpsCampaignRecord[] = [];
  protected tasks: OpsTaskRecord[] = [];
  protected approvals: OpsApprovalRecord[] = [];
  protected agentRuns: OpsAgentRunRecord[] = [];
  protected auditLog: AuditEvent[] = [];
  protected ownerReviews: OwnerReviewRequest[] = [];
  protected ownerDecisions: OwnerReviewDecision[] = [];
  protected emailOutbox: EmailOutboxItem[] = [];

  insertCampaign(brand_id: BrandId, record: OpsCampaignRecord): OpsCampaignRecord {
    const parsed = OpsCampaignRecordSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.campaigns.push(parsed);
    return parsed;
  }

  listCampaigns(brand_id: BrandId, opts?: { limit?: number }): OpsCampaignSummary[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(this.campaigns.filter((c) => c.brand_id === brand_id))
      .slice(0, limit)
      .map(toSummary);
  }

  getCampaign(brand_id: BrandId, campaign_id: string): OpsCampaignRecord | null {
    const found = this.campaigns.find((c) => c.campaign_id === campaign_id);
    if (!found) return null;
    if (found.brand_id !== brand_id) return null;
    return found;
  }

  updateCampaignStatus(
    brand_id: BrandId,
    campaign_id: string,
    status: OpsCampaignStatus,
  ): OpsCampaignRecord | null {
    return this.patchCampaign(brand_id, campaign_id, { status });
  }

  patchCampaign(
    brand_id: BrandId,
    campaign_id: string,
    patch: {
      status?: OpsCampaignStatus;
      pack?: CampaignPack;
      guardian_passed?: boolean;
      approvable?: boolean;
    },
  ): OpsCampaignRecord | null {
    const found = this.getCampaign(brand_id, campaign_id);
    if (!found) return null;
    const updated = OpsCampaignRecordSchema.parse({
      ...found,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.pack ? { pack: patch.pack } : {}),
      ...(patch.guardian_passed !== undefined
        ? { guardian_passed: patch.guardian_passed }
        : {}),
      ...(patch.approvable !== undefined ? { approvable: patch.approvable } : {}),
      updated_at: new Date().toISOString(),
    });
    this.campaigns = this.campaigns.map((c) =>
      c.campaign_id === campaign_id ? updated : c,
    );
    return updated;
  }

  insertTask(brand_id: BrandId, record: OpsTaskRecord): OpsTaskRecord {
    const parsed = OpsTaskRecordSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.tasks.push(parsed);
    return parsed;
  }

  listTasks(brand_id: BrandId, opts?: { limit?: number }): OpsTaskRecord[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(this.tasks.filter((t) => t.brand_id === brand_id)).slice(
      0,
      limit,
    );
  }

  insertApproval(brand_id: BrandId, record: OpsApprovalRecord): OpsApprovalRecord {
    const parsed = OpsApprovalRecordSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.approvals.push(parsed);
    return parsed;
  }

  listApprovals(
    brand_id: BrandId,
    opts?: { inboxOnly?: boolean; limit?: number },
  ): OpsApprovalRecord[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    const inboxOnly = opts?.inboxOnly !== false;
    const rows = this.approvals.filter((a) => a.brand_id === brand_id);
    const filtered = inboxOnly ? rows.filter(inboxEligible) : rows;
    return newestFirst(filtered).slice(0, limit);
  }

  getApproval(brand_id: BrandId, approval_id: string): OpsApprovalRecord | null {
    const found = this.approvals.find((a) => a.approval_id === approval_id);
    if (!found || found.brand_id !== brand_id) return null;
    return found;
  }

  decideApproval(
    brand_id: BrandId,
    approval_id: string,
    input: ApprovalDecisionInput,
  ): OpsApprovalRecord {
    const found = this.getApproval(brand_id, approval_id);
    if (!found) {
      throw new Error(`Approval not found for brand ${brand_id}`);
    }
    if (found.decision !== "PENDING") {
      throw new Error(`Approval ${approval_id} is already ${found.decision}`);
    }
    if (
      APPROVAL_LEVEL_RANK[found.level] >
      APPROVAL_LEVEL_RANK[PHASE1_MAX_EXECUTABLE_LEVEL]
    ) {
      throw new Error(
        `Approval ${approval_id} is ${found.level}; Wave 3 inbox only decides Level ≤1`,
      );
    }
    const rationale = input.rationale.trim();
    if (!rationale) {
      throw new Error("rationale required");
    }
    const updated = OpsApprovalRecordSchema.parse({
      ...found,
      decision: input.decision,
      rationale,
      actor: input.actor,
      updated_at: new Date().toISOString(),
    });
    this.approvals = this.approvals.map((a) =>
      a.approval_id === approval_id ? updated : a,
    );
    if (found.campaign_id) {
      this.updateCampaignStatus(
        brand_id,
        found.campaign_id,
        input.decision === "APPROVED" ? "INTERNAL_APPROVED" : "REJECTED",
      );
    }
    return updated;
  }

  insertAgentRun(brand_id: BrandId, record: OpsAgentRunRecord): OpsAgentRunRecord {
    const parsed = OpsAgentRunRecordSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.agentRuns.push(parsed);
    return parsed;
  }

  listAgentRuns(brand_id: BrandId, opts?: { limit?: number }): OpsAgentRunRecord[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(this.agentRuns.filter((r) => r.brand_id === brand_id)).slice(
      0,
      limit,
    );
  }

  appendAudit(
    brand_id: BrandId,
    event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    if (event.brand_id && event.brand_id !== brand_id) {
      throw new CrossBrandDeniedError(brand_id, event.brand_id);
    }
    const parsed = AuditEventSchema.parse({
      ...event,
      brand_id,
      event_id: randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      metadata: event.metadata ?? {},
    });
    this.auditLog.push(parsed);
    return parsed;
  }

  listAudit(
    brand_id: BrandId,
    opts?: { limit?: number; task_id?: string },
  ): AuditEvent[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    const rows = this.auditLog.filter((e) => {
      if (e.brand_id !== brand_id) return false;
      if (opts?.task_id && e.task_id !== opts.task_id) return false;
      return true;
    });
    return newestFirst(rows).slice(0, limit);
  }

  clearAudit(brand_id: BrandId): void {
    this.auditLog = this.auditLog.filter((e) => e.brand_id !== brand_id);
  }

  insertOwnerReview(brand_id: BrandId, record: OwnerReviewRequest): OwnerReviewRequest {
    const parsed = OwnerReviewRequestSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.ownerReviews.push(parsed);
    return parsed;
  }

  listOwnerReviews(brand_id: BrandId, opts?: { limit?: number }): OwnerReviewRequest[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(this.ownerReviews.filter((r) => r.brand_id === brand_id)).slice(
      0,
      limit,
    );
  }

  getOwnerReview(brand_id: BrandId, review_id: string): OwnerReviewRequest | null {
    const found = this.ownerReviews.find((r) => r.review_id === review_id);
    if (!found || found.brand_id !== brand_id) return null;
    return found;
  }

  getOwnerReviewByToken(token: string): OwnerReviewRequest | null {
    return this.ownerReviews.find((r) => r.token === token) ?? null;
  }

  updateOwnerReview(
    brand_id: BrandId,
    review_id: string,
    patch: { status: OwnerReviewStatus; decided_at?: string },
  ): OwnerReviewRequest | null {
    const found = this.getOwnerReview(brand_id, review_id);
    if (!found) return null;
    const updated = OwnerReviewRequestSchema.parse({
      ...found,
      status: patch.status,
      ...(patch.decided_at ? { decided_at: patch.decided_at } : {}),
    });
    this.ownerReviews = this.ownerReviews.map((r) =>
      r.review_id === review_id ? updated : r,
    );
    return updated;
  }

  insertOwnerDecision(
    brand_id: BrandId,
    record: OwnerReviewDecision,
  ): OwnerReviewDecision {
    const parsed = OwnerReviewDecisionSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.ownerDecisions.push(parsed);
    return parsed;
  }

  listOwnerDecisions(
    brand_id: BrandId,
    opts?: { limit?: number },
  ): OwnerReviewDecision[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(
      this.ownerDecisions.filter((d) => d.brand_id === brand_id),
    ).slice(0, limit);
  }

  insertOutboxItem(brand_id: BrandId, record: EmailOutboxItem): EmailOutboxItem {
    const parsed = EmailOutboxItemSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    this.emailOutbox.push(parsed);
    return parsed;
  }

  listOutbox(brand_id: BrandId, opts?: { limit?: number }): EmailOutboxItem[] {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    return newestFirst(this.emailOutbox.filter((e) => e.brand_id === brand_id)).slice(
      0,
      limit,
    );
  }

  /** Test helper — never used by panel HTTP. */
  exportSnapshot(): OpsSnapshot {
    return OpsSnapshotSchema.parse({
      campaigns: this.campaigns,
      tasks: this.tasks,
      approvals: this.approvals,
      agent_runs: this.agentRuns,
      audit_log: this.auditLog,
      owner_reviews: this.ownerReviews,
      owner_decisions: this.ownerDecisions,
      email_outbox: this.emailOutbox,
    });
  }
}

export class FileOpsStore extends MemoryOpsStore {
  private readonly filePath: string;

  constructor(dir: string) {
    super();
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, "store.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.persist();
      return;
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
    const snap = OpsSnapshotSchema.parse(raw);
    this.campaigns = snap.campaigns;
    this.tasks = snap.tasks;
    this.approvals = snap.approvals;
    this.agentRuns = snap.agent_runs;
    this.auditLog = snap.audit_log;
    this.ownerReviews = snap.owner_reviews;
    this.ownerDecisions = snap.owner_decisions;
    this.emailOutbox = snap.email_outbox;
  }

  private persist(): void {
    const snap = this.exportSnapshot();
    const tmp = `${this.filePath}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(snap, null, 2) + "\n");
    renameSync(tmp, this.filePath);
  }

  override insertCampaign(brand_id: BrandId, record: OpsCampaignRecord): OpsCampaignRecord {
    const row = super.insertCampaign(brand_id, record);
    this.persist();
    return row;
  }

  override updateCampaignStatus(
    brand_id: BrandId,
    campaign_id: string,
    status: OpsCampaignStatus,
  ): OpsCampaignRecord | null {
    const row = super.updateCampaignStatus(brand_id, campaign_id, status);
    this.persist();
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
    this.persist();
    return row;
  }

  override insertTask(brand_id: BrandId, record: OpsTaskRecord): OpsTaskRecord {
    const row = super.insertTask(brand_id, record);
    this.persist();
    return row;
  }

  override insertApproval(brand_id: BrandId, record: OpsApprovalRecord): OpsApprovalRecord {
    const row = super.insertApproval(brand_id, record);
    this.persist();
    return row;
  }

  override decideApproval(
    brand_id: BrandId,
    approval_id: string,
    input: ApprovalDecisionInput,
  ): OpsApprovalRecord {
    const row = super.decideApproval(brand_id, approval_id, input);
    this.persist();
    return row;
  }

  override insertAgentRun(brand_id: BrandId, record: OpsAgentRunRecord): OpsAgentRunRecord {
    const row = super.insertAgentRun(brand_id, record);
    this.persist();
    return row;
  }

  override appendAudit(
    brand_id: BrandId,
    event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    const row = super.appendAudit(brand_id, event);
    this.persist();
    return row;
  }

  override clearAudit(brand_id: BrandId): void {
    super.clearAudit(brand_id);
    this.persist();
  }

  override insertOwnerReview(
    brand_id: BrandId,
    record: OwnerReviewRequest,
  ): OwnerReviewRequest {
    const row = super.insertOwnerReview(brand_id, record);
    this.persist();
    return row;
  }

  override updateOwnerReview(
    brand_id: BrandId,
    review_id: string,
    patch: { status: OwnerReviewStatus; decided_at?: string },
  ): OwnerReviewRequest | null {
    const row = super.updateOwnerReview(brand_id, review_id, patch);
    this.persist();
    return row;
  }

  override insertOwnerDecision(
    brand_id: BrandId,
    record: OwnerReviewDecision,
  ): OwnerReviewDecision {
    const row = super.insertOwnerDecision(brand_id, record);
    this.persist();
    return row;
  }

  override insertOutboxItem(brand_id: BrandId, record: EmailOutboxItem): EmailOutboxItem {
    const row = super.insertOutboxItem(brand_id, record);
    this.persist();
    return row;
  }
}

/** Audit sink bound to one brand_id — never writes another brand's events. */
export class OpsAuditSink implements AuditSink {
  constructor(
    private readonly store: OpsStore,
    private readonly brand_id: BrandId,
  ) {}

  append(
    partial: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    if (partial.brand_id && partial.brand_id !== this.brand_id) {
      throw new CrossBrandDeniedError(this.brand_id, partial.brand_id);
    }
    return this.store.appendAudit(this.brand_id, partial);
  }

  list(filter?: { brand_id?: BrandId; task_id?: string }): AuditEvent[] {
    if (filter?.brand_id && filter.brand_id !== this.brand_id) {
      return [];
    }
    return this.store.listAudit(
      this.brand_id,
      filter?.task_id ? { task_id: filter.task_id } : {},
    );
  }

  clear(): void {
    this.store.clearAudit(this.brand_id);
  }
}

export type OpsBackend = "memory" | "file";

export function createOpsStore(opts?: {
  backend?: OpsBackend;
  dir?: string;
}): OpsStore {
  const requested = opts?.backend ?? inferOpsBackend();
  if (requested === "memory") {
    return new MemoryOpsStore();
  }
  const dir = opts?.dir ?? join(process.cwd(), "data", "ops");
  return new FileOpsStore(dir);
}

function inferOpsBackend(): OpsBackend {
  const explicit = process.env.MOS_OPS_BACKEND?.trim().toLowerCase();
  if (explicit === "memory") return "memory";
  if (explicit === "supabase") {
    throw new Error(
      "MOS_OPS_BACKEND=supabase is not wired in Wave 3. Use file or memory; apply supabase/migrations when a project is provisioned.",
    );
  }
  return "file";
}

export function slimAgentResult(
  value: unknown,
  agent: AgentId,
): Record<string, unknown> {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = {
      agent,
      summary:
        typeof v.summary === "string" ? v.summary : `${agent} draft output`,
    };
    if (typeof v.task_id === "string") out.task_id = v.task_id;
    if (typeof v.recommended_next_action === "string") {
      out.recommended_next_action = v.recommended_next_action;
    }
    return out;
  }
  return { agent, summary: `${agent} draft output` };
}

export function defaultApprovalLevel(): ApprovalLevel {
  return "LEVEL_1";
}

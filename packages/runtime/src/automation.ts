import { randomUUID } from "node:crypto";
import {
  AutomationDigestRecordSchema,
  AutomationDigestSchema,
  DigestPeriodSchema,
  DigestRunResultSchema,
  EmailOutboxItemSchema,
  ExecutiveDashboardSchema,
  type AutomationDigest,
  type AutomationDigestRecord,
  type BrandId,
  type DigestAnalyticsStub,
  type DigestCostsPlaceholder,
  type DigestCounts,
  type DigestItem,
  type DigestPeriod,
  type DigestRunResult,
  type EmailOutboxItem,
  type ExecutiveDashboard,
} from "@marketing-os/contracts";
import { assertWaveEnabled } from "./phase-gates.js";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  getBrandEntry,
} from "./brand-registry.js";
import { CrossBrandDeniedError, type OpsStore } from "./ops-store.js";
import { readAnalyticsSnapshot } from "./analytics.js";
import {
  createEmailAdapter,
  resolveEmailMode,
  type EmailAdapter,
} from "./email-adapter.js";
import { ownerSettings } from "./owner-review.js";
import { containsRawPii } from "./pii-vault.js";
import { WAVE8_EMAIL_TEMPLATE } from "./fixtures/wave8-automation.js";

export class AutomationDisabledError extends Error {
  readonly code = "AUTOMATION_DISABLED" as const;
  readonly status = 403;
  constructor(public readonly brand_id: BrandId) {
    super(
      `Automation is disabled for ${brand_id}. Set automation_enabled on the registry entry.`,
    );
    this.name = "AutomationDisabledError";
  }
}

export class AutomationDigestInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "AutomationDigestInputError";
  }
}

export type AutomationRuntimeOpts = {
  store: OpsStore;
  email?: EmailAdapter;
  brandsRoot?: string;
  now?: Date;
  period?: DigestPeriod;
};

const COSTS_NOTE =
  "PLACEHOLDER — not live spend. Wave 6 staging counts only. No Meta/Google billed cost.";
const ANALYTICS_NOTE =
  "FIXTURE — not live GA4/GSC/social/ads. Values are placeholders, not observed traffic.";

function requireSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

function assertDigestSafe(payload: unknown, label: string): void {
  if (containsRawPii(payload)) {
    throw new AutomationDigestInputError(
      `${label} would expose raw email/phone — digests may use counts and opaque refs only`,
    );
  }
}

export function resolveDigestPeriod(raw?: string): DigestPeriod {
  const value = (raw ?? "daily").trim().toLowerCase();
  const parsed = DigestPeriodSchema.safeParse(value);
  if (!parsed.success) {
    throw new AutomationDigestInputError(
      `period must be daily or weekly (got ${raw ?? ""})`,
    );
  }
  return parsed.data;
}

export function digestWindow(
  period: DigestPeriod,
  now: Date,
): { window_start: string; window_end: string } {
  const end = now.getTime();
  const ms = period === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return {
    window_start: new Date(end - ms).toISOString(),
    window_end: now.toISOString(),
  };
}

export function automationSettings(
  brand_id: BrandId,
  brandsRoot?: string,
): {
  automation_enabled: boolean;
  owner_email_enabled: boolean;
  owner_email?: string;
  owner_cc: string[];
  display_name: string;
} {
  const entry = getBrandEntry(brand_id, brandsRootOpt(brandsRoot));
  const owner = ownerSettings(entry);
  return {
    automation_enabled: entry.automation_enabled === true,
    owner_email_enabled: owner.enabled,
    ...(owner.owner_email ? { owner_email: owner.owner_email } : {}),
    owner_cc: owner.owner_cc,
    display_name: entry.display_name,
  };
}

export function isAutomationEnabled(
  brand_id: BrandId,
  brandsRoot?: string,
): boolean {
  return automationSettings(brand_id, brandsRoot).automation_enabled;
}

function collectCounts(store: OpsStore, brand_id: BrandId): DigestCounts {
  const campaigns = store.listCampaigns(brand_id, { limit: 200 });
  const pendingApprovals = store.listApprovals(brand_id, {
    inboxOnly: true,
    limit: 200,
  });
  const pendingReviews = store
    .listOwnerReviews(brand_id, { limit: 200 })
    .filter((row) => row.status === "PENDING");
  const social = store.listSocialOutbox(brand_id, { limit: 200 });
  const ads = store.listAdOutbox(brand_id, { limit: 200 });
  const leads = store.listLeads(brand_id, { limit: 200 });
  return {
    campaign_count: campaigns.length,
    draft_count: campaigns.filter((c) => c.status === "DRAFT").length,
    pending_approval_count: pendingApprovals.length,
    pending_owner_review_count: pendingReviews.length,
    social_outbox_count: social.length,
    ad_outbox_count: ads.length,
    lead_count: leads.length,
    attributed_lead_count: leads.filter((l) => Boolean(l.campaign_id)).length,
  };
}

function collectCampaignBreakdown(
  store: OpsStore,
  brand_id: BrandId,
): ExecutiveDashboard["campaigns"] {
  const campaigns = store.listCampaigns(brand_id, { limit: 200 });
  const count = (status: (typeof campaigns)[number]["status"]) =>
    campaigns.filter((c) => c.status === status).length;
  return {
    total: campaigns.length,
    draft: count("DRAFT"),
    awaiting_owner: count("AWAITING_OWNER"),
    changes_requested: count("CHANGES_REQUESTED"),
    internal_approved: count("INTERNAL_APPROVED"),
    rejected: count("REJECTED"),
    blocked: count("BLOCKED"),
    approvable: campaigns.filter((c) => c.approvable).length,
  };
}

function collectApprovalBreakdown(
  store: OpsStore,
  brand_id: BrandId,
): ExecutiveDashboard["approvals"] {
  const rows = store.listApprovals(brand_id, { inboxOnly: false, limit: 200 });
  const count = (decision: (typeof rows)[number]["decision"]) =>
    rows.filter((r) => r.decision === decision).length;
  return {
    pending: count("PENDING"),
    approved: count("APPROVED"),
    rejected: count("REJECTED"),
    blocked: count("BLOCKED"),
  };
}

function collectLeadBreakdown(
  store: OpsStore,
  brand_id: BrandId,
): ExecutiveDashboard["leads"] {
  const leads = store.listLeads(brand_id, { limit: 200 });
  const attributed = leads.filter((l) => Boolean(l.campaign_id)).length;
  return {
    total: leads.length,
    attributed,
    unattributed: leads.length - attributed,
    form: leads.filter((l) => l.source === "FORM").length,
    whatsapp: leads.filter((l) => l.source === "WHATSAPP").length,
    other: leads.filter((l) => l.source !== "FORM" && l.source !== "WHATSAPP")
      .length,
  };
}

function analyticsStub(
  brand_id: BrandId,
  brandsRoot?: string,
): DigestAnalyticsStub {
  const snapshot = readAnalyticsSnapshot(brand_id, brandsRootOpt(brandsRoot));
  return {
    status: "FIXTURE",
    live_keys_used: false,
    write_scopes: [],
    provider_count: snapshot.providers.length,
    rows_with_valid_utm: snapshot.utm_health.rows_with_valid_utm,
    rows_missing_or_invalid_utm: snapshot.utm_health.rows_missing_or_invalid_utm,
    note: ANALYTICS_NOTE,
  };
}

function costsPlaceholder(
  store: OpsStore,
  brand_id: BrandId,
): DigestCostsPlaceholder {
  return {
    status: "PLACEHOLDER",
    live_spend: false,
    currency: "USD",
    staged_recommendation_count: store.listAdOutbox(brand_id, { limit: 200 })
      .length,
    note: COSTS_NOTE,
  };
}

function digestItems(brand_id: BrandId, counts: DigestCounts): DigestItem[] {
  return [
    {
      brand_id,
      headline: `Campaign drafts: ${counts.campaign_count} (${counts.draft_count} DRAFT)`,
      severity: "INFO",
    },
    {
      brand_id,
      headline: `Pending Level ≤1 approvals: ${counts.pending_approval_count}`,
      severity: counts.pending_approval_count > 0 ? "WARN" : "INFO",
    },
    {
      brand_id,
      headline: `Pending owner reviews: ${counts.pending_owner_review_count}`,
      severity: counts.pending_owner_review_count > 0 ? "WARN" : "INFO",
    },
    {
      brand_id,
      headline: `Dry-run social outbox: ${counts.social_outbox_count}`,
      severity: "INFO",
    },
    {
      brand_id,
      headline: `Staged ads outbox: ${counts.ad_outbox_count} — not live spend`,
      severity: "INFO",
    },
    {
      brand_id,
      headline: `Leads: ${counts.lead_count} (${counts.attributed_lead_count} attributed)`,
      severity: "INFO",
    },
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAutomationDigestCopy(digest: AutomationDigest): {
  subject: string;
  text_body: string;
  html_body: string;
} {
  const c = digest.counts;
  const subject = `[${digest.display_name}] ${digest.period} automation digest — dry-run safe`;
  const lines = [
    `${digest.period} automation digest for ${digest.display_name}.`,
    "",
    "Today",
    `Campaign drafts: ${c.campaign_count} (${c.draft_count} DRAFT)`,
    `Pending Level ≤1 approvals: ${c.pending_approval_count}`,
    `Pending owner reviews: ${c.pending_owner_review_count}`,
    `Dry-run social outbox: ${c.social_outbox_count}`,
    `Staged ads outbox: ${c.ad_outbox_count}`,
    `Leads (count only): ${c.lead_count}`,
    `Leads attributed: ${c.attributed_lead_count}`,
    "",
    "Analytics (fixture stub)",
    digest.analytics.note,
    `Providers: ${digest.analytics.provider_count}. UTM valid rows: ${digest.analytics.rows_with_valid_utm}.`,
    "",
    "Costs (placeholder)",
    digest.costs.note,
    `Staged recommendations: ${digest.costs.staged_recommendation_count}. Live spend: OFF.`,
    "",
    "Live publish: OFF",
    "Live ads: OFF",
    "",
    "Counts and opaque refs only. No raw email or phone.",
  ];
  const text_body = lines.join("\n");
  const html_body = `<p>${escapeHtml(digest.period)} automation digest for ${escapeHtml(digest.display_name)}.</p>
<h2>Today</h2>
<ul>
<li>Campaign drafts: ${c.campaign_count} (${c.draft_count} DRAFT)</li>
<li>Pending Level ≤1 approvals: ${c.pending_approval_count}</li>
<li>Pending owner reviews: ${c.pending_owner_review_count}</li>
<li>Dry-run social outbox: ${c.social_outbox_count}</li>
<li>Staged ads outbox: ${c.ad_outbox_count}</li>
<li>Leads (count only): ${c.lead_count}</li>
<li>Leads attributed: ${c.attributed_lead_count}</li>
</ul>
<h2>Analytics (fixture stub)</h2>
<p>${escapeHtml(digest.analytics.note)}</p>
<p>Providers: ${digest.analytics.provider_count}. UTM valid rows: ${digest.analytics.rows_with_valid_utm}.</p>
<h2>Costs (placeholder)</h2>
<p>${escapeHtml(digest.costs.note)}</p>
<p>Staged recommendations: ${digest.costs.staged_recommendation_count}. Live spend: OFF.</p>
<p>Live publish: OFF. Live ads: OFF.</p>
<p>Counts and opaque refs only. No raw email or phone.</p>`;
  assertDigestSafe({ subject, text_body, html_body }, "digest email copy");
  return { subject, text_body, html_body };
}

/**
 * Build a per-brand digest. Requires WAVE_8. Does not email.
 * Old all-brand listing is removed — that crossed isolation.
 */
export function buildAutomationDigest(input: {
  brand_id: string;
  store: OpsStore;
  period?: DigestPeriod | string;
  brandsRoot?: string;
  now?: Date;
}): AutomationDigest {
  assertWaveEnabled("WAVE_8_AUTOMATION_DASHBOARD", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const period = resolveDigestPeriod(input.period);
  const now = input.now ?? new Date();
  const window = digestWindow(period, now);
  const settings = automationSettings(brand_id, input.brandsRoot);
  const counts = collectCounts(input.store, brand_id);
  const analytics = analyticsStub(brand_id, input.brandsRoot);
  const costs = costsPlaceholder(input.store, brand_id);
  const items = digestItems(brand_id, counts);
  const payload = {
    period,
    counts,
    analytics,
    costs,
    live_publish: false,
    live_ads: false,
  };
  assertDigestSafe(payload, "digest payload");
  const digest = AutomationDigestSchema.parse({
    digest_id: randomUUID(),
    brand_id,
    period,
    generated_at: now.toISOString(),
    window_start: window.window_start,
    window_end: window.window_end,
    display_name: settings.display_name,
    counts,
    analytics,
    costs,
    items,
    live_publish: false,
    live_ads: false,
    automation_enabled: settings.automation_enabled,
    owner_email_enabled: settings.owner_email_enabled,
    email_mode: resolveEmailMode(),
    payload,
  });
  assertDigestSafe(digest, "automation digest");
  return digest;
}

/** Wave 8 daily helper — single brand only. */
export function buildDailyDigest(input: {
  brand_id: string;
  store: OpsStore;
  brandsRoot?: string;
  now?: Date;
}): AutomationDigest {
  return buildAutomationDigest({ ...input, period: "daily" });
}

export function buildExecutiveDashboard(input: {
  brand_id: string;
  store: OpsStore;
  brandsRoot?: string;
  now?: Date;
}): ExecutiveDashboard {
  assertWaveEnabled("WAVE_8_AUTOMATION_DASHBOARD", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const now = input.now ?? new Date();
  const settings = automationSettings(brand_id, input.brandsRoot);
  const today = collectCounts(input.store, brand_id);
  const latest = input.store.listAutomationDigests(brand_id, { limit: 1 })[0];
  const dashboard = ExecutiveDashboardSchema.parse({
    brand_id,
    display_name: settings.display_name,
    generated_at: now.toISOString(),
    automation_enabled: settings.automation_enabled,
    owner_email_enabled: settings.owner_email_enabled,
    live_publish: false,
    live_ads: false,
    today,
    campaigns: collectCampaignBreakdown(input.store, brand_id),
    approvals: collectApprovalBreakdown(input.store, brand_id),
    leads: collectLeadBreakdown(input.store, brand_id),
    analytics: analyticsStub(brand_id, input.brandsRoot),
    costs: costsPlaceholder(input.store, brand_id),
    ...(latest ? { latest_digest: latest } : {}),
  });
  assertDigestSafe(dashboard, "executive dashboard");
  return dashboard;
}

async function dispatchDigestEmail(input: {
  store: OpsStore;
  email: EmailAdapter;
  digest: AutomationDigest;
  to: string[];
  cc: string[];
}): Promise<EmailOutboxItem> {
  const copy = renderAutomationDigestCopy(input.digest);
  const dispatched = await input.email.dispatch({
    brand_id: input.digest.brand_id,
    template: WAVE8_EMAIL_TEMPLATE,
    to: input.to,
    cc: input.cc,
    subject: copy.subject,
    text_body: copy.text_body,
    html_body: copy.html_body,
    idempotency_key: `mos/${input.digest.brand_id}/${WAVE8_EMAIL_TEMPLATE}/${input.digest.digest_id}`,
  });
  const item = EmailOutboxItemSchema.parse({
    outbox_id: randomUUID(),
    brand_id: input.digest.brand_id,
    template: WAVE8_EMAIL_TEMPLATE,
    mode: input.email.mode,
    to: input.to,
    cc: input.cc,
    subject: copy.subject,
    text_body: copy.text_body,
    html_body: copy.html_body,
    payload: input.digest.payload,
    status: dispatched.status,
    live_publish: false,
    live_ads: false,
    created_at: new Date().toISOString(),
    ...(dispatched.provider_message_id
      ? { provider_message_id: dispatched.provider_message_id }
      : {}),
  });
  assertDigestSafe(
    { subject: item.subject, text_body: item.text_body, html_body: item.html_body, payload: item.payload },
    "digest outbox content",
  );
  input.store.insertOutboxItem(input.digest.brand_id, item);
  input.store.appendAudit(input.digest.brand_id, {
    brand_id: input.digest.brand_id,
    event_type: dispatched.status === "BLOCKED" ? "EMAIL_BLOCKED" : "EMAIL_RECORDED",
    message: `${WAVE8_EMAIL_TEMPLATE} ${dispatched.status} (${input.email.mode})`,
    metadata: {
      outbox_id: item.outbox_id,
      digest_id: input.digest.digest_id,
      template: WAVE8_EMAIL_TEMPLATE,
      mode: input.email.mode,
      period: input.digest.period,
      live_publish: false,
      live_ads: false,
    },
  });
  return item;
}

function persistDigestRecord(
  store: OpsStore,
  digest: AutomationDigest,
  status: "RECORDED" | "BLOCKED",
  blocked_reason?: string,
  email_outbox_id?: string,
): AutomationDigestRecord {
  const record = AutomationDigestRecordSchema.parse({
    digest_id: digest.digest_id,
    brand_id: digest.brand_id,
    period: digest.period,
    generated_at: digest.generated_at,
    window_start: digest.window_start,
    window_end: digest.window_end,
    status,
    ...(blocked_reason ? { blocked_reason } : {}),
    ...(email_outbox_id ? { email_outbox_id } : {}),
    summary: digest.counts,
    analytics: digest.analytics,
    costs: digest.costs,
    live_publish: false,
    live_ads: false,
    created_at: digest.generated_at,
  });
  assertDigestSafe(record, "digest record");
  store.insertAutomationDigest(digest.brand_id, record);
  store.appendAudit(digest.brand_id, {
    brand_id: digest.brand_id,
    event_type: status === "BLOCKED" ? "DIGEST_BLOCKED" : "DIGEST_RECORDED",
    message:
      status === "BLOCKED"
        ? `${digest.period} digest blocked (${blocked_reason ?? "kill switch"})`
        : `${digest.period} digest recorded`,
    metadata: {
      digest_id: digest.digest_id,
      period: digest.period,
      status,
      blocked_reason: blocked_reason ?? null,
      email_outbox_id: email_outbox_id ?? null,
      live_publish: false,
      live_ads: false,
    },
  });
  return record;
}

/**
 * Build + optionally email a digest.
 * Kill switch (`automation_enabled=false`) blocks send — no outbox row.
 * Emailing also requires `owner_email_enabled` + `owner_email`.
 */
export async function runAutomationDigest(input: {
  brand_id: string;
  store: OpsStore;
  period?: DigestPeriod | string;
  brandsRoot?: string;
  email?: EmailAdapter;
  now?: Date;
}): Promise<DigestRunResult> {
  const digest = buildAutomationDigest(input);
  const settings = automationSettings(digest.brand_id, input.brandsRoot);
  if (!settings.automation_enabled) {
    const record = persistDigestRecord(
      input.store,
      digest,
      "BLOCKED",
      "AUTOMATION_DISABLED",
    );
    return DigestRunResultSchema.parse({
      brand_id: digest.brand_id,
      period: digest.period,
      digest,
      record,
      status: "BLOCKED",
      blocked_reason: "AUTOMATION_DISABLED",
      live_publish: false,
      live_ads: false,
    });
  }
  if (!settings.owner_email_enabled) {
    const record = persistDigestRecord(
      input.store,
      digest,
      "BLOCKED",
      "OWNER_EMAIL_DISABLED",
    );
    return DigestRunResultSchema.parse({
      brand_id: digest.brand_id,
      period: digest.period,
      digest,
      record,
      status: "BLOCKED",
      blocked_reason: "OWNER_EMAIL_DISABLED",
      live_publish: false,
      live_ads: false,
    });
  }
  if (!settings.owner_email) {
    const record = persistDigestRecord(
      input.store,
      digest,
      "BLOCKED",
      "OWNER_EMAIL_MISSING",
    );
    return DigestRunResultSchema.parse({
      brand_id: digest.brand_id,
      period: digest.period,
      digest,
      record,
      status: "BLOCKED",
      blocked_reason: "OWNER_EMAIL_MISSING",
      live_publish: false,
      live_ads: false,
    });
  }
  const email = input.email ?? createEmailAdapter();
  const outbox = await dispatchDigestEmail({
    store: input.store,
    email,
    digest,
    to: [settings.owner_email],
    cc: settings.owner_cc,
  });
  const record = persistDigestRecord(
    input.store,
    digest,
    "RECORDED",
    undefined,
    outbox.outbox_id,
  );
  return DigestRunResultSchema.parse({
    brand_id: digest.brand_id,
    period: digest.period,
    digest,
    record,
    status: "RECORDED",
    email_outbox_id: outbox.outbox_id,
    live_publish: false,
    live_ads: false,
  });
}

export function listAutomationDigestsForBrand(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): AutomationDigestRecord[] {
  return store.listAutomationDigests(brand_id, opts);
}

export function getAutomationDigestForBrand(
  store: OpsStore,
  brand_id: BrandId,
  digest_id: string,
): AutomationDigestRecord | null {
  const row = store.getAutomationDigest(brand_id, digest_id);
  if (!row) return null;
  requireSameBrand(brand_id, row.brand_id);
  return row;
}

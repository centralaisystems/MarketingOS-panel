import { randomBytes, randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  EmailOutboxItemSchema,
  OwnerReviewDecisionSchema,
  OwnerReviewRequestSchema,
  PackReviewFieldsSchema,
  type AgentResult,
  type BrandId,
  type BrandRegistryEntry,
  type CampaignPack,
  type EmailOutboxItem,
  type EmailTemplateKind,
  type OwnerReviewAction,
  type OwnerReviewDecision,
  type OwnerReviewRequest,
  type PackReviewFields,
} from "@marketing-os/contracts";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  displayNameForBrandId,
  getBrandEntry,
} from "./brand-registry.js";
import { loadBrandContext } from "./brand-loader.js";
import { runBrandGuardian } from "./agents/brand-guardian.js";
import { CrossBrandDeniedError, OpsAuditSink, type OpsStore } from "./ops-store.js";
import { decideInboxApproval } from "./ops-persist.js";
import {
  createEmailAdapter,
  type EmailAdapter,
} from "./email-adapter.js";

export class OwnerEmailDisabledError extends Error {
  readonly code = "OWNER_EMAIL_DISABLED" as const;
  constructor(public readonly brand_id: BrandId) {
    super(
      `Owner email is disabled for ${brand_id}. Set owner_email_enabled on the registry entry.`,
    );
    this.name = "OwnerEmailDisabledError";
  }
}

export class OwnerEmailMissingError extends Error {
  readonly code = "OWNER_EMAIL_MISSING" as const;
  constructor(public readonly brand_id: BrandId) {
    super(
      `owner_email is not set for ${brand_id}. Owner review is opt-in per brand.`,
    );
    this.name = "OwnerEmailMissingError";
  }
}

export class OwnerReviewNotFoundError extends Error {
  readonly code = "OWNER_REVIEW_NOT_FOUND" as const;
  constructor() {
    super("Owner review not found");
    this.name = "OwnerReviewNotFoundError";
  }
}

export type OwnerReviewRuntimeOpts = {
  store: OpsStore;
  email?: EmailAdapter;
  brandsRoot?: string;
  panelBaseUrl?: string;
};

function panelBase(url?: string): string {
  return (url ?? process.env.MOS_PANEL_BASE_URL ?? "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );
}

export function packReviewFields(pack: CampaignPack): PackReviewFields {
  return PackReviewFieldsSchema.parse({
    pack_id: pack.pack_id,
    brand_id: pack.brand_id,
    objective: pack.objective,
    generated_at: pack.generated_at,
    approval_level_cap: pack.approval_level_cap,
    guardian_passed: pack.guardian.passed,
    guardian_reasons: pack.guardian.reasons,
    guardian_reviewed: pack.guardian.reviewed,
    approvable: pack.approvable,
    content_draft_count: pack.content_drafts.length,
    creative_brief_count: pack.creative_briefs.length,
    video_brief_count: pack.video_briefs.length,
    has_social_calendar: pack.social_calendar !== undefined,
    has_paid_recommendations: pack.paid_recommendations !== undefined,
    live_publish: false,
    live_ads: false,
  });
}

export function ownerSettings(entry: BrandRegistryEntry): {
  enabled: boolean;
  owner_email?: string;
  owner_cc: string[];
} {
  return {
    enabled: entry.owner_email_enabled === true,
    ...(entry.owner_email ? { owner_email: entry.owner_email } : {}),
    owner_cc: entry.owner_cc ?? [],
  };
}

function assertOwnerEmailReady(
  brand_id: BrandId,
  brandsRoot?: string,
): { email: string; cc: string[]; display_name: string } {
  const entry = getBrandEntry(brand_id, brandsRootOpt(brandsRoot));
  const settings = ownerSettings(entry);
  if (!settings.enabled) {
    throw new OwnerEmailDisabledError(brand_id);
  }
  if (!settings.owner_email) {
    throw new OwnerEmailMissingError(brand_id);
  }
  return {
    email: settings.owner_email,
    cc: settings.owner_cc,
    display_name: entry.display_name,
  };
}

function asAgentResult(value: unknown): AgentResult | null {
  const parsed = AgentResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function collectPackDrafts(pack: CampaignPack): Array<{
  subject: string;
  result: AgentResult;
}> {
  const drafts: Array<{ subject: string; result: AgentResult }> = [];
  for (const draft of pack.content_drafts) {
    const result = asAgentResult(draft);
    if (result) drafts.push({ subject: "content", result });
  }
  const social = asAgentResult(pack.social_calendar);
  if (social) drafts.push({ subject: "social", result: social });
  for (const brief of pack.creative_briefs) {
    const result = asAgentResult(brief);
    if (result) drafts.push({ subject: "creative", result });
  }
  return drafts;
}

export function rerunGuardianOnPackDrafts(
  pack: CampaignPack,
  store: OpsStore,
  opts?: { brandsRoot?: string },
): { passed: boolean; reasons: string[]; reviewed: string[] } {
  const audit = new OpsAuditSink(store, pack.brand_id);
  const { profile } = loadBrandContext(pack.brand_id, audit, brandsRootOpt(opts?.brandsRoot));
  const drafts = collectPackDrafts(pack);
  const reviewedSubjects = drafts.map(({ subject, result }) => {
    const verdict = runBrandGuardian(result, profile, audit);
    return { subject, verdict };
  });
  const reasons = reviewedSubjects.flatMap(({ subject, verdict }) =>
    verdict.passed
      ? []
      : verdict.reasons.length
        ? verdict.reasons.map((reason) => `${subject}: ${reason}`)
        : [`${subject}: Guardian rejected without reasons`],
  );
  return {
    passed: reviewedSubjects.every(({ verdict }) => verdict.passed),
    reasons,
    reviewed: reviewedSubjects.map(({ subject }) => subject),
  };
}

function renderMaterialsReady(input: {
  display_name: string;
  fields: PackReviewFields;
  review_url: string;
}): { subject: string; text_body: string; html_body: string } {
  const subject = `[${input.display_name}] Materials ready for review — not live`;
  const lines = [
    `${input.display_name} materials are ready for owner review.`,
    "",
    `Objective: ${input.fields.objective}`,
    `Pack: ${input.fields.pack_id}`,
    `Guardian: ${input.fields.guardian_passed ? "passed" : "rejected"}`,
    `Approvable: ${input.fields.approvable ? "yes" : "no"}`,
    `Approval cap: ${input.fields.approval_level_cap}`,
    `Content drafts: ${input.fields.content_draft_count}`,
    `Creative briefs: ${input.fields.creative_brief_count}`,
    `Video briefs: ${input.fields.video_brief_count}`,
    `Social calendar: ${input.fields.has_social_calendar ? "yes" : "no"}`,
    `Paid recommendations present: ${input.fields.has_paid_recommendations ? "yes" : "no"} (not live spend)`,
    "Live publish: OFF",
    "Live ads: OFF — Wave 6 is not unlocked. This is not live spend.",
    "",
    `Review (approve or request changes): ${input.review_url}`,
    "",
    "This message uses pack/approval fields only. No commercial claim is asserted as VERIFIED.",
    "Binaries are not attached. Open the panel review page for the draft summary.",
  ];
  const text_body = lines.join("\n");
  const html_body = `<p>${escapeHtml(input.display_name)} materials are ready for owner review.</p>
<ul>
<li>Objective: ${escapeHtml(input.fields.objective)}</li>
<li>Pack: ${escapeHtml(input.fields.pack_id)}</li>
<li>Guardian: ${input.fields.guardian_passed ? "passed" : "rejected"}</li>
<li>Approvable: ${input.fields.approvable ? "yes" : "no"}</li>
<li>Approval cap: ${escapeHtml(input.fields.approval_level_cap)}</li>
<li>Content drafts: ${input.fields.content_draft_count}</li>
<li>Creative briefs: ${input.fields.creative_brief_count}</li>
<li>Live publish: OFF</li>
<li>Live ads: OFF — Wave 6 is not unlocked. This is not live spend.</li>
</ul>
<p><a href="${escapeHtml(input.review_url)}">Open owner review</a></p>
<p>This message uses pack/approval fields only. No commercial claim is asserted as VERIFIED.</p>`;
  return { subject, text_body, html_body };
}

function renderProgressDigest(input: {
  display_name: string;
  brand_id: BrandId;
  campaign_count: number;
  pending_approval_count: number;
  pending_owner_review_count: number;
  review_url?: string;
}): { subject: string; text_body: string; html_body: string } {
  const subject = `[${input.display_name}] Progress digest — dry-run safe`;
  const lines = [
    `Dry-run safe progress digest for ${input.display_name}.`,
    "",
    `Campaign drafts: ${input.campaign_count}`,
    `Pending Level ≤1 approvals: ${input.pending_approval_count}`,
    `Pending owner reviews: ${input.pending_owner_review_count}`,
    "Live publish: OFF",
    "Live ads: OFF — Wave 6 is not unlocked. This is not live spend.",
    "",
    input.review_url
      ? `Latest review page: ${input.review_url}`
      : "No open owner review. Open the operator panel for this brand.",
    "",
    "Counts only. No Meta/Google live data. No VERIFIED commercial claims.",
  ];
  const text_body = lines.join("\n");
  const html_body = `<p>Dry-run safe progress digest for ${escapeHtml(input.display_name)}.</p>
<ul>
<li>Campaign drafts: ${input.campaign_count}</li>
<li>Pending Level ≤1 approvals: ${input.pending_approval_count}</li>
<li>Pending owner reviews: ${input.pending_owner_review_count}</li>
<li>Live publish: OFF</li>
<li>Live ads: OFF — Wave 6 is not unlocked. This is not live spend.</li>
</ul>
<p>Counts only. No Meta/Google live data. No VERIFIED commercial claims.</p>`;
  return { subject, text_body, html_body };
}

function renderAdsStub(input: {
  display_name: string;
}): { subject: string; text_body: string; html_body: string } {
  const subject = `[${input.display_name}] Ads progress (stub) — not live spend`;
  const text_body = [
    `Ads progress for ${input.display_name} is a stub only.`,
    "",
    "Wave 6 paid ads is not unlocked.",
    "No Meta or Google live data is included.",
    "Live ads: OFF. This is not live spend.",
    "Live publish: OFF.",
    "",
    "Use materials review for campaign packs and creative drafts.",
  ].join("\n");
  const html_body = `<p>Ads progress for ${escapeHtml(input.display_name)} is a stub only.</p>
<p>Wave 6 paid ads is not unlocked. No Meta or Google live data. Live ads: OFF. This is not live spend.</p>
<p>Use materials review for campaign packs and creative drafts.</p>`;
  return { subject, text_body, html_body };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function recordAndDispatch(input: {
  store: OpsStore;
  email: EmailAdapter;
  brand_id: BrandId;
  template: EmailTemplateKind;
  to: string[];
  cc: string[];
  subject: string;
  text_body: string;
  html_body: string;
  payload: Record<string, unknown>;
  review_id?: string;
  review_url?: string;
  campaign_id?: string;
  pack_id?: string;
}): Promise<EmailOutboxItem> {
  const dispatched = await input.email.dispatch({
    brand_id: input.brand_id,
    template: input.template,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text_body: input.text_body,
    html_body: input.html_body,
    idempotency_key: `mos/${input.brand_id}/${input.template}/${input.review_id ?? input.campaign_id ?? randomUUID()}`,
  });
  const item = EmailOutboxItemSchema.parse({
    outbox_id: randomUUID(),
    brand_id: input.brand_id,
    template: input.template,
    mode: input.email.mode,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text_body: input.text_body,
    html_body: input.html_body,
    ...(input.review_url ? { review_url: input.review_url } : {}),
    ...(input.review_id ? { review_id: input.review_id } : {}),
    ...(input.campaign_id ? { campaign_id: input.campaign_id } : {}),
    ...(input.pack_id ? { pack_id: input.pack_id } : {}),
    payload: input.payload,
    status: dispatched.status,
    live_publish: false,
    live_ads: false,
    created_at: new Date().toISOString(),
    ...(dispatched.provider_message_id
      ? { provider_message_id: dispatched.provider_message_id }
      : {}),
  });
  input.store.insertOutboxItem(input.brand_id, item);
  const eventType =
    dispatched.status === "SENT"
      ? "EMAIL_SENT"
      : dispatched.status === "BLOCKED"
        ? "EMAIL_BLOCKED"
        : dispatched.status === "FAILED"
          ? "ERROR"
          : "EMAIL_RECORDED";
  input.store.appendAudit(input.brand_id, {
    brand_id: input.brand_id,
    event_type: eventType,
    message: `${input.template} ${dispatched.status} (${input.email.mode})`,
    metadata: {
      outbox_id: item.outbox_id,
      template: input.template,
      mode: input.email.mode,
      review_id: input.review_id ?? null,
      campaign_id: input.campaign_id ?? null,
      live_publish: false,
      live_ads: false,
    },
  });
  return item;
}

export async function requestOwnerReview(
  input: {
    brand_id: string;
    campaign_id: string;
    actor?: string;
    template?: Extract<EmailTemplateKind, "MATERIALS_READY">;
  },
  opts: OwnerReviewRuntimeOpts,
): Promise<{ review: OwnerReviewRequest; outbox: EmailOutboxItem }> {
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const owner = assertOwnerEmailReady(brand_id, opts.brandsRoot);
  const campaign = opts.store.getCampaign(brand_id, input.campaign_id);
  if (!campaign) {
    throw new Error("campaign not found");
  }
  if (!campaign.approvable || !campaign.guardian_passed) {
    throw Object.assign(new Error("campaign is not approvable for owner review"), {
      status: 400,
    });
  }
  const fields = packReviewFields(campaign.pack);
  const token = randomBytes(32).toString("hex");
  const review_id = randomUUID();
  const review_url = `${panelBase(opts.panelBaseUrl)}/owner-review?token=${token}`;
  const now = new Date().toISOString();
  const approval = opts.store
    .listApprovals(brand_id, { inboxOnly: false, limit: 100 })
    .find((row) => row.campaign_id === campaign.campaign_id && row.decision === "PENDING");
  const review = OwnerReviewRequestSchema.parse({
    review_id,
    brand_id,
    campaign_id: campaign.campaign_id,
    pack_id: campaign.pack_id,
    ...(approval ? { approval_id: approval.approval_id } : {}),
    token,
    status: "PENDING",
    review_url,
    template: "MATERIALS_READY",
    created_at: now,
  });
  opts.store.insertOwnerReview(brand_id, review);
  opts.store.patchCampaign(brand_id, campaign.campaign_id, {
    status: "AWAITING_OWNER",
  });
  opts.store.appendAudit(brand_id, {
    brand_id,
    event_type: "OWNER_REVIEW_REQUESTED",
    message: `Owner review requested for pack ${campaign.pack_id}`,
    approval_level: "LEVEL_1",
    metadata: {
      review_id,
      campaign_id: campaign.campaign_id,
      pack_id: campaign.pack_id,
      actor: input.actor ?? "panel-operator",
      live_publish: false,
      live_ads: false,
    },
  });
  const copy = renderMaterialsReady({
    display_name: owner.display_name,
    fields,
    review_url,
  });
  const email = opts.email ?? createEmailAdapter();
  const outbox = await recordAndDispatch({
    store: opts.store,
    email,
    brand_id,
    template: "MATERIALS_READY",
    to: [owner.email],
    cc: owner.cc,
    subject: copy.subject,
    text_body: copy.text_body,
    html_body: copy.html_body,
    payload: { ...fields, display_name: owner.display_name },
    review_id,
    review_url,
    campaign_id: campaign.campaign_id,
    pack_id: campaign.pack_id,
  });
  return { review, outbox };
}

export async function sendOwnerProgressEmail(
  input: {
    brand_id: string;
    template: Extract<EmailTemplateKind, "PROGRESS_DIGEST" | "ADS_PROGRESS_STUB">;
  },
  opts: OwnerReviewRuntimeOpts,
): Promise<EmailOutboxItem> {
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const owner = assertOwnerEmailReady(brand_id, opts.brandsRoot);
  const campaigns = opts.store.listCampaigns(brand_id);
  const pendingApprovals = opts.store.listApprovals(brand_id, { inboxOnly: true });
  const pendingReviews = opts.store
    .listOwnerReviews(brand_id)
    .filter((row) => row.status === "PENDING");
  const latest = pendingReviews[0];
  const copy =
    input.template === "ADS_PROGRESS_STUB"
      ? renderAdsStub({ display_name: owner.display_name })
      : renderProgressDigest({
          display_name: owner.display_name,
          brand_id,
          campaign_count: campaigns.length,
          pending_approval_count: pendingApprovals.length,
          pending_owner_review_count: pendingReviews.length,
          ...(latest ? { review_url: latest.review_url } : {}),
        });
  const email = opts.email ?? createEmailAdapter();
  return recordAndDispatch({
    store: opts.store,
    email,
    brand_id,
    template: input.template,
    to: [owner.email],
    cc: owner.cc,
    subject: copy.subject,
    text_body: copy.text_body,
    html_body: copy.html_body,
    payload: {
      display_name: owner.display_name,
      campaign_count: campaigns.length,
      pending_approval_count: pendingApprovals.length,
      pending_owner_review_count: pendingReviews.length,
      live_publish: false,
      live_ads: false,
      wave_6_unlocked: false,
    },
    ...(latest
      ? { review_id: latest.review_id, review_url: latest.review_url }
      : {}),
  });
}

export function getOwnerReviewByToken(
  store: OpsStore,
  token: string,
): OwnerReviewRequest | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  return store.getOwnerReviewByToken(trimmed);
}

export function publicOwnerReviewView(
  store: OpsStore,
  token: string,
  opts?: { brandsRoot?: string },
): {
  review_id: string;
  brand_id: BrandId;
  display_name: string;
  status: OwnerReviewRequest["status"];
  pack: PackReviewFields;
  live_publish: false;
  live_ads: false;
} {
  const review = getOwnerReviewByToken(store, token);
  if (!review) {
    throw new OwnerReviewNotFoundError();
  }
  const campaign = store.getCampaign(review.brand_id, review.campaign_id);
  if (!campaign) {
    throw new OwnerReviewNotFoundError();
  }
  return {
    review_id: review.review_id,
    brand_id: review.brand_id,
    display_name: displayNameForBrandId(review.brand_id, brandsRootOpt(opts?.brandsRoot)),
    status: review.status,
    pack: packReviewFields(campaign.pack),
    live_publish: false,
    live_ads: false,
  };
}

export function decideOwnerReview(
  input: {
    token: string;
    decision: OwnerReviewAction;
    note?: string;
    actor?: string;
    brand_id?: string;
  },
  opts: OwnerReviewRuntimeOpts,
): {
  review: OwnerReviewRequest;
  decision: OwnerReviewDecision;
  revision_task_id?: string;
} {
  const review = getOwnerReviewByToken(opts.store, input.token);
  if (!review) {
    throw new OwnerReviewNotFoundError();
  }
  if (input.brand_id && input.brand_id !== review.brand_id) {
    throw new CrossBrandDeniedError(input.brand_id as BrandId, review.brand_id);
  }
  if (review.status !== "PENDING") {
    throw Object.assign(new Error(`Owner review is already ${review.status}`), {
      status: 400,
    });
  }
  const note = (input.note ?? "").trim();
  if (input.decision === "CHANGES_REQUESTED" && !note) {
    throw Object.assign(new Error("note required when requesting changes"), {
      status: 400,
    });
  }
  const now = new Date().toISOString();
  const actor = input.actor?.trim() || "brand-owner";
  const campaign = opts.store.getCampaign(review.brand_id, review.campaign_id);
  if (!campaign) {
    throw new OwnerReviewNotFoundError();
  }

  let revision_task_id: string | undefined;
  let guardian:
    | { passed: boolean; reasons: string[]; reviewed: string[] }
    | undefined;

  if (input.decision === "APPROVED") {
    if (review.approval_id) {
      const existing = opts.store.getApproval(review.brand_id, review.approval_id);
      if (existing?.decision === "PENDING") {
        decideInboxApproval(
          opts.store,
          review.brand_id,
          review.approval_id,
          {
            decision: "APPROVED",
            rationale: note || "Owner approved materials for internal use only.",
            actor,
          },
          brandsRootOpt(opts.brandsRoot),
        );
      }
    }
    opts.store.patchCampaign(review.brand_id, review.campaign_id, {
      status: "INTERNAL_APPROVED",
    });
  } else {
    const guardianVerdict = rerunGuardianOnPackDrafts(campaign.pack, opts.store, {
      ...brandsRootOpt(opts.brandsRoot),
    });
    guardian = guardianVerdict;
    const updatedPack = {
      ...campaign.pack,
      guardian: {
        passed: guardianVerdict.passed,
        reasons: guardianVerdict.reasons,
        reviewed: guardianVerdict.reviewed,
      },
      approvable: guardianVerdict.passed,
      live_publish: false as const,
      live_ads: false as const,
    };
    const task = opts.store.insertTask(review.brand_id, {
      task_id: randomUUID(),
      brand_id: review.brand_id,
      campaign_id: review.campaign_id,
      objective: `Revise campaign pack after owner change request: ${note}`,
      requested_by: actor,
      assigned_agent: "A05_CONTENT_COPY",
      input: {
        review_id: review.review_id,
        pack_id: review.pack_id,
        owner_note: note,
        previous_guardian: campaign.pack.guardian,
      },
      expected_output: "Revised drafts addressing the owner change note",
      dependencies: [],
      priority: "HIGH",
      approval_level: "LEVEL_1",
      status: "PENDING",
      workflow_state: "IDEA",
      required_capabilities: ["PRODUCE_INTERNAL_ANALYSIS"],
      created_at: now,
    });
    revision_task_id = task.task_id;
    opts.store.patchCampaign(review.brand_id, review.campaign_id, {
      status: "CHANGES_REQUESTED",
      pack: updatedPack,
      guardian_passed: guardianVerdict.passed,
      approvable: guardianVerdict.passed,
    });
  }

  const updated = opts.store.updateOwnerReview(review.brand_id, review.review_id, {
    status: input.decision,
    decided_at: now,
  });
  const decision = OwnerReviewDecisionSchema.parse({
    decision_id: randomUUID(),
    review_id: review.review_id,
    brand_id: review.brand_id,
    decision: input.decision,
    note,
    actor,
    created_at: now,
    ...(revision_task_id ? { revision_task_id } : {}),
    ...(guardian ? { guardian } : {}),
    live_publish: false,
    live_ads: false,
  });
  opts.store.insertOwnerDecision(review.brand_id, decision);
  opts.store.appendAudit(review.brand_id, {
    brand_id: review.brand_id,
    ...(revision_task_id ? { task_id: revision_task_id } : {}),
    event_type: "OWNER_REVIEW_DECISION",
    message: `Owner ${input.decision} for pack ${review.pack_id}`,
    approval_level: "LEVEL_1",
    metadata: {
      review_id: review.review_id,
      campaign_id: review.campaign_id,
      revision_task_id: revision_task_id ?? null,
      note_present: Boolean(note),
      live_publish: false,
      live_ads: false,
    },
  });
  return {
    review: updated ?? review,
    decision,
    ...(revision_task_id ? { revision_task_id } : {}),
  };
}

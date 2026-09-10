import { randomUUID } from "node:crypto";
import {
  AdCampaignDraftSchema,
  AdOutboxItemSchema,
  AdStageRequestSchema,
  AdStagingJobSchema,
  AdStagingResultSchema,
  PaidRecommendationSchema,
  WAVE6_FIRST_PLATFORM,
  type AdCampaignDraft,
  type AdOutboxItem,
  type AdPlatform,
  type AdStageRequest,
  type AdStagingAction,
  type AdStagingJob,
  type AdStagingResult,
  type BrandId,
  type CampaignPack,
  type OpsApprovalRecord,
  type OpsCampaignRecord,
  type PaidRecommendation,
} from "@marketing-os/contracts";
import { assertRegisteredBrandId, brandsRootOpt } from "./brand-registry.js";
import { CrossBrandDeniedError, type OpsStore } from "./ops-store.js";
import {
  assertLiveAdsAllowed,
  assertWaveEnabled,
  isLiveAdsOperatorFlagOn,
  loadPhaseGates,
} from "./phase-gates.js";
import {
  createPaidAdsAdapter,
  type PaidAdsAdapter,
} from "./paid-ads-adapter.js";
import { wave6FixtureForPlatform } from "./fixtures/wave6-paid-ads.js";

export class PaidAdsInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PaidAdsInputError";
  }
}

export class PaidAdsLiveBlockedError extends Error {
  readonly status = 403;
  readonly live_ads = false as const;
  constructor(message: string) {
    super(message);
    this.name = "PaidAdsLiveBlockedError";
  }
}

export type PaidAdsRuntimeOpts = {
  store: OpsStore;
  adapter?: PaidAdsAdapter;
  brandsRoot?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function extractPaidRecommendations(
  pack: CampaignPack,
): PaidRecommendation[] {
  const paid = asRecord(pack.paid_recommendations);
  if (!paid) return [];

  const fromDeliverables = Array.isArray(paid.deliverables)
    ? paid.deliverables.flatMap((row) => {
        const item = asRecord(row);
        if (!item) return [];
        const nested = item.recommendation ?? item;
        const parsed = PaidRecommendationSchema.safeParse(nested);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  if (fromDeliverables.length > 0) return fromDeliverables;

  const direct = PaidRecommendationSchema.safeParse(paid);
  return direct.success ? [direct.data] : [];
}

function requireCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id: string,
): OpsCampaignRecord {
  const campaign = store.getCampaign(brand_id, campaign_id);
  if (!campaign) {
    throw new PaidAdsInputError(
      `campaign not found for ${brand_id}: ${campaign_id}`,
    );
  }
  if (campaign.brand_id !== brand_id) {
    throw new CrossBrandDeniedError(brand_id, campaign.brand_id);
  }
  return campaign;
}

function assertPackEligible(campaign: OpsCampaignRecord): void {
  if (!campaign.approvable || !campaign.guardian_passed) {
    throw new PaidAdsInputError(
      "Paid staging requires an approvable Guardian-passed campaign pack.",
    );
  }
  if (campaign.status !== "INTERNAL_APPROVED") {
    throw new PaidAdsInputError(
      `Campaign ${campaign.campaign_id} must be INTERNAL_APPROVED before staging (status=${campaign.status}). Approve the Level 1 inbox item first.`,
    );
  }
}

function level1ApprovalForCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id: string,
): OpsApprovalRecord | undefined {
  return store
    .listApprovals(brand_id, { inboxOnly: false, limit: 100 })
    .find(
      (row) =>
        row.campaign_id === campaign_id &&
        row.decision === "APPROVED" &&
        (row.level === "LEVEL_0" || row.level === "LEVEL_1"),
    );
}

function level3ApprovalForCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id?: string,
): OpsApprovalRecord | undefined {
  return store
    .listApprovals(brand_id, { inboxOnly: false, limit: 100 })
    .find(
      (row) =>
        row.decision === "APPROVED" &&
        row.level === "LEVEL_3" &&
        (!campaign_id || row.campaign_id === campaign_id),
    );
}

function recommendationForPlatform(
  pack: CampaignPack,
  platform: AdPlatform,
): PaidRecommendation {
  const recs = extractPaidRecommendations(pack);
  const match = recs.find((row) => row.platform === platform) ?? recs[0];
  if (!match) {
    throw new PaidAdsInputError(
      `No paid recommendation found on pack for ${platform}.`,
    );
  }
  if (match.launch_allowed) {
    throw new PaidAdsInputError(
      "Recommendation must keep launch_allowed=false until the Level 3 live path is approved.",
    );
  }
  return match;
}

function campaignDraftFromRecommendation(
  rec: PaidRecommendation,
  campaign: OpsCampaignRecord,
  platform: AdPlatform,
): AdCampaignDraft {
  const fixture = wave6FixtureForPlatform(platform);
  return AdCampaignDraftSchema.parse({
    brand_id: campaign.brand_id,
    platform,
    environment: "non-prod",
    adapter: fixture.adapter,
    objective: rec.objective,
    audience_notes: rec.audience_notes,
    creative_notes: rec.creative_notes,
    test_plan: rec.test_plan,
    budget: {
      kind: "RECOMMENDATION",
      notes: rec.budget_notes,
      mutation_allowed: false,
      launch_allowed: false,
    },
    campaign_id: campaign.campaign_id,
    pack_id: campaign.pack_id,
    launch_allowed: false,
  });
}

export function listEligiblePaidRecommendations(opts: PaidAdsRuntimeOpts & {
  brand_id: string;
  campaign_id?: string;
}): {
  brand_id: BrandId;
  platform: typeof WAVE6_FIRST_PLATFORM;
  live_ads_allowed: false;
  items: Array<{
    campaign_id: string;
    pack_id: string;
    objective: string;
    status: string;
    recommendations: PaidRecommendation[];
  }>;
} {
  assertWaveEnabled("WAVE_6_PAID_ADS", brandsRootOpt(opts.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    opts.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const campaigns = opts.campaign_id
    ? [requireCampaign(opts.store, brand_id, opts.campaign_id)]
    : opts.store
        .listCampaigns(brand_id, { limit: 50 })
        .map((row) => opts.store.getCampaign(brand_id, row.campaign_id))
        .filter((row): row is OpsCampaignRecord => row !== null);

  const items = campaigns
    .filter(
      (c) =>
        c.brand_id === brand_id &&
        c.approvable &&
        c.guardian_passed &&
        c.status === "INTERNAL_APPROVED",
    )
    .map((c) => ({
      campaign_id: c.campaign_id,
      pack_id: c.pack_id,
      objective: c.objective,
      status: c.status,
      recommendations: extractPaidRecommendations(c.pack),
    }))
    .filter((item) => item.recommendations.length > 0);

  return {
    brand_id,
    platform: WAVE6_FIRST_PLATFORM,
    live_ads_allowed: false,
    items,
  };
}

function persistStaging(
  input: {
    brand_id: BrandId;
    campaign: OpsCampaignRecord;
    platform: AdPlatform;
    action: AdStagingAction;
    actor: string;
    rationale: string;
    recommendation: PaidRecommendation;
    draft: AdCampaignDraft;
    dispatched: ReturnType<PaidAdsAdapter["dispatch"]>;
  },
  opts: PaidAdsRuntimeOpts,
): AdStagingResult {
  const now = new Date().toISOString();
  const approval = level1ApprovalForCampaign(
    opts.store,
    input.brand_id,
    input.campaign.campaign_id,
  );
  const outbox_id = randomUUID();
  const job_id = randomUUID();
  const outbox = AdOutboxItemSchema.parse({
    outbox_id,
    brand_id: input.brand_id,
    platform: input.platform,
    action: input.action,
    mode: "STAGING",
    status: input.dispatched.status,
    staging: true,
    would_launch: input.dispatched.would_launch,
    would_mutate_budget: false,
    campaign_id: input.campaign.campaign_id,
    pack_id: input.campaign.pack_id,
    campaign_draft: input.draft,
    budget: input.draft.budget,
    recommendation: input.recommendation,
    actor: input.actor,
    rationale: input.rationale,
    ...(approval
      ? { approval_id: approval.approval_id, approval_level: approval.level }
      : {}),
    live_ads_allowed: false,
    live_publish: false,
    live_ads: false,
    external_side_effects: false,
    created_at: now,
  });
  const job = AdStagingJobSchema.parse({
    job_id,
    brand_id: input.brand_id,
    platform: input.platform,
    action: input.action,
    mode: "STAGING",
    status: input.dispatched.status,
    campaign_id: input.campaign.campaign_id,
    pack_id: input.campaign.pack_id,
    outbox_id,
    campaign_draft: input.draft,
    budget: input.draft.budget,
    actor: input.actor,
    rationale: input.rationale,
    live_ads_allowed: false,
    live_publish: false,
    live_ads: false,
    external_side_effects: false,
    created_at: now,
  });
  opts.store.insertAdOutbox(input.brand_id, outbox);
  opts.store.insertAdStagingJob(input.brand_id, job);
  opts.store.appendAudit(input.brand_id, {
    brand_id: input.brand_id,
    event_type:
      input.action === "BUDGET_MUTATION"
        ? "AD_BUDGET_STAGING_RECORDED"
        : "AD_STAGING_RECORDED",
    message: input.dispatched.message,
    approval_level: approval?.level ?? "LEVEL_1",
    metadata: {
      job_id,
      outbox_id,
      campaign_id: input.campaign.campaign_id,
      pack_id: input.campaign.pack_id,
      platform: input.platform,
      action: input.action,
      actor: input.actor,
      live_ads: false,
      live_ads_allowed: false,
      external_side_effects: false,
      adapter: input.draft.adapter,
    },
  });

  return AdStagingResultSchema.parse({
    brand_id: input.brand_id,
    platform: input.platform,
    action: input.action,
    status: "STAGING_OK",
    message: input.dispatched.message,
    staging: true,
    would_launch: input.dispatched.would_launch,
    would_mutate_budget: false,
    live_publish: false,
    live_ads: false,
    live_ads_allowed: false,
    external_side_effects: false,
    job,
    outbox,
  });
}

export function stageAdLaunch(
  input: AdStageRequest,
  opts: PaidAdsRuntimeOpts,
): AdStagingResult {
  assertWaveEnabled("WAVE_6_PAID_ADS", brandsRootOpt(opts.brandsRoot));
  const req = AdStageRequestSchema.parse({ ...input, action: "LAUNCH" });
  const brand_id = assertRegisteredBrandId(
    req.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const campaign = requireCampaign(opts.store, brand_id, req.campaign_id);
  assertPackEligible(campaign);
  const recommendation = recommendationForPlatform(campaign.pack, req.platform);
  const draft = campaignDraftFromRecommendation(
    recommendation,
    campaign,
    req.platform,
  );
  const adapter =
    opts.adapter ?? createPaidAdsAdapter({ platform: req.platform });
  const dispatched = adapter.dispatch({
    draft,
    staging: true,
    action: "LAUNCH",
  });
  return persistStaging(
    {
      brand_id,
      campaign,
      platform: req.platform,
      action: "LAUNCH",
      actor: req.actor,
      rationale: req.rationale,
      recommendation,
      draft,
      dispatched,
    },
    opts,
  );
}

export function stageBudgetMutation(
  input: AdStageRequest,
  opts: PaidAdsRuntimeOpts,
): AdStagingResult {
  assertWaveEnabled("WAVE_6_PAID_ADS", brandsRootOpt(opts.brandsRoot));
  const req = AdStageRequestSchema.parse({
    ...input,
    action: "BUDGET_MUTATION",
  });
  const brand_id = assertRegisteredBrandId(
    req.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const campaign = requireCampaign(opts.store, brand_id, req.campaign_id);
  assertPackEligible(campaign);
  const recommendation = recommendationForPlatform(campaign.pack, req.platform);
  const draft = campaignDraftFromRecommendation(
    recommendation,
    campaign,
    req.platform,
  );
  const adapter =
    opts.adapter ?? createPaidAdsAdapter({ platform: req.platform });
  const dispatched = adapter.dispatch({
    draft,
    staging: true,
    action: "BUDGET_MUTATION",
  });
  return persistStaging(
    {
      brand_id,
      campaign,
      platform: req.platform,
      action: "BUDGET_MUTATION",
      actor: req.actor,
      rationale: req.rationale,
      recommendation,
      draft,
      dispatched,
    },
    opts,
  );
}

export function attemptLiveAdLaunch(
  input: {
    brand_id: string;
    campaign_id?: string;
    outbox_id?: string;
    platform?: AdPlatform;
    action?: AdStagingAction;
    actor?: string;
  },
  opts: PaidAdsRuntimeOpts,
): AdStagingResult {
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const gates = loadPhaseGates(brandsRootOpt(opts.brandsRoot));
  const level3 = input.campaign_id
    ? level3ApprovalForCampaign(opts.store, brand_id, input.campaign_id)
    : undefined;
  const action = input.action ?? "LAUNCH";
  const reasons: string[] = [];
  if (!gates.enabled_waves.includes("WAVE_6_PAID_ADS")) {
    reasons.push("WAVE_6_PAID_ADS is not enabled");
  }
  if (!gates.live_ads_allowed) {
    reasons.push("live_ads_allowed is false");
  }
  if (!isLiveAdsOperatorFlagOn()) {
    reasons.push("MOS_LIVE_ADS operator flag is false");
  }
  if (!level3) {
    reasons.push("Level 3 APPROVED approval row is required for live fire");
  }
  reasons.push("Meta/Google Ads live adapter is not implemented");

  const message = `Live ad ${action.toLowerCase()} is blocked. ${reasons.join("; ")}. No ad network call.`;
  opts.store.appendAudit(brand_id, {
    brand_id,
    event_type: "AD_LAUNCH_LIVE_BLOCKED",
    message,
    approval_level: "LEVEL_3",
    capability: action === "BUDGET_MUTATION" ? "CHANGE_AD_BUDGET" : "LAUNCH_AD",
    metadata: {
      campaign_id: input.campaign_id ?? null,
      outbox_id: input.outbox_id ?? null,
      platform: input.platform ?? WAVE6_FIRST_PLATFORM,
      action,
      actor: input.actor ?? "panel-operator",
      live_ads_allowed: gates.live_ads_allowed,
      operator_flag: isLiveAdsOperatorFlagOn(),
      level3_approval_id: level3?.approval_id ?? null,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
    },
  });

  try {
    assertLiveAdsAllowed(brandsRootOpt(opts.brandsRoot));
  } catch {
    throw new PaidAdsLiveBlockedError(message);
  }
  if (!level3) {
    throw new PaidAdsLiveBlockedError(message);
  }
  throw new PaidAdsLiveBlockedError(message);
}

export function listAdOutbox(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): AdOutboxItem[] {
  return store.listAdOutbox(brand_id, opts);
}

export function listAdStagingJobs(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): AdStagingJob[] {
  return store.listAdStagingJobs(brand_id, opts);
}

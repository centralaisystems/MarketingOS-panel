import { randomUUID } from "node:crypto";
import {
  SocialPublishOutboxRecordSchema,
  SocialPublishResultSchema,
  SocialPublishScheduleRequestSchema,
  WAVE5_FIRST_CHANNEL,
  type BrandId,
  type CampaignPack,
  type OpsApprovalRecord,
  type OpsCampaignRecord,
  type SocialCalendarItem,
  type SocialPublishOutboxRecord,
  type SocialPublishResult,
  type SocialPublishScheduleRequest,
} from "@marketing-os/contracts";
import { assertRegisteredBrandId, brandsRootOpt } from "./brand-registry.js";
import { CrossBrandDeniedError, type OpsStore } from "./ops-store.js";
import {
  assertLivePublishAllowed,
  assertWaveEnabled,
  isLivePublishOperatorFlagOn,
  loadPhaseGates,
} from "./phase-gates.js";
import {
  createSocialPublishAdapter,
  type SocialPublishAdapter,
} from "./social-adapter.js";
import { WAVE5_INSTAGRAM_CHANNEL } from "./fixtures/wave5-instagram.js";
import {
  listApprovedUnusedAssets,
  type AssetCatalog,
} from "./assets.js";

export class SocialPublishInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "SocialPublishInputError";
  }
}

export class SocialPublishLiveBlockedError extends Error {
  readonly status = 403;
  readonly live_publish = false as const;
  constructor(message: string) {
    super(message);
    this.name = "SocialPublishLiveBlockedError";
  }
}

export type SocialPublishRuntimeOpts = {
  store: OpsStore;
  assets?: AssetCatalog;
  adapter?: SocialPublishAdapter;
  brandsRoot?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function extractSocialCalendarItems(
  pack: CampaignPack,
): SocialCalendarItem[] {
  const social = asRecord(pack.social_calendar);
  if (!social) return [];
  const deliverables = social.deliverables;
  if (!Array.isArray(deliverables)) return [];
  const items: SocialCalendarItem[] = [];
  for (const deliverable of deliverables) {
    const row = asRecord(deliverable);
    const week = row?.week;
    if (!Array.isArray(week)) continue;
    for (const entry of week) {
      const item = asRecord(entry);
      if (!item) continue;
      const key =
        typeof item.day === "string" && item.day.trim()
          ? item.day.trim()
          : typeof item.idea === "string" && item.idea.trim()
            ? item.idea.trim()
            : "";
      const caption =
        typeof item.caption === "string" && item.caption.trim()
          ? item.caption.trim()
          : typeof item.caption_hint === "string" && item.caption_hint.trim()
            ? item.caption_hint.trim()
            : "";
      const idea =
        typeof item.idea === "string" && item.idea.trim()
          ? item.idea.trim()
          : key;
      if (key && caption) {
        items.push({ key, idea, caption });
      }
    }
  }
  return items;
}

function requireCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id: string,
): OpsCampaignRecord {
  const campaign = store.getCampaign(brand_id, campaign_id);
  if (!campaign) {
    throw new SocialPublishInputError(
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
    throw new SocialPublishInputError(
      "Social publish requires an approvable Guardian-passed campaign pack. Posts are not taken from rejected drafts.",
    );
  }
  if (campaign.status !== "INTERNAL_APPROVED") {
    throw new SocialPublishInputError(
      `Campaign ${campaign.campaign_id} must be INTERNAL_APPROVED before dry-run schedule (status=${campaign.status}). Approve the Level 1 inbox item first.`,
    );
  }
}

function resolveApprovedAssets(
  brand_id: BrandId,
  requested: string[],
  catalog: AssetCatalog | undefined,
): { asset_ids: string[]; media_uris: string[] } {
  if (!catalog) {
    if (requested.length === 0) {
      throw new SocialPublishInputError(
        "Asset catalog is required so Wave 5 can attach approved Instagram-suitable assets.",
      );
    }
    return { asset_ids: requested, media_uris: [] };
  }

  const ids =
    requested.length > 0
      ? requested
      : listApprovedUnusedAssets(catalog, brand_id, { platform: "instagram" })
          .slice(0, 1)
          .map((a) => a.asset_id);

  if (ids.length === 0) {
    throw new SocialPublishInputError(
      "An APPROVED Instagram-suitable asset is required. None found for this brand.",
    );
  }

  const media_uris: string[] = [];
  for (const asset_id of ids) {
    const asset = catalog.getMetadata(brand_id, asset_id);
    if (!asset) {
      throw new SocialPublishInputError(
        `Approved asset ${asset_id} not found for ${brand_id}`,
      );
    }
    if (asset.brand_id !== brand_id) {
      throw new CrossBrandDeniedError(brand_id, asset.brand_id);
    }
    if (asset.approval_status !== "APPROVED") {
      throw new SocialPublishInputError(
        `Asset ${asset_id} is ${asset.approval_status}; only APPROVED assets may be scheduled.`,
      );
    }
    if (
      asset.platform_suitability.length > 0 &&
      !asset.platform_suitability.includes("instagram")
    ) {
      throw new SocialPublishInputError(
        `Asset ${asset_id} is not marked Instagram-suitable.`,
      );
    }
    media_uris.push(asset.storage_uri);
  }
  return { asset_ids: ids, media_uris };
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

function level2ApprovalForCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id?: string,
): OpsApprovalRecord | undefined {
  return store
    .listApprovals(brand_id, { inboxOnly: false, limit: 100 })
    .find(
      (row) =>
        row.decision === "APPROVED" &&
        (row.level === "LEVEL_2" || row.level === "LEVEL_3") &&
        (!campaign_id || row.campaign_id === campaign_id),
    );
}

export function listEligibleSocialPublishItems(
  opts: SocialPublishRuntimeOpts & { brand_id: string; campaign_id?: string },
): {
  brand_id: BrandId;
  channel: typeof WAVE5_FIRST_CHANNEL;
  live_publish_allowed: false;
  items: Array<{
    campaign_id: string;
    pack_id: string;
    objective: string;
    status: string;
    calendar: SocialCalendarItem[];
    suggested_asset_ids: string[];
  }>;
} {
  assertWaveEnabled("WAVE_5_SOCIAL_PUBLISH", brandsRootOpt(opts.brandsRoot));
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

  const suggested = opts.assets
    ? listApprovedUnusedAssets(opts.assets, brand_id, { platform: "instagram" })
        .slice(0, 3)
        .map((a) => a.asset_id)
    : [];

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
      calendar: extractSocialCalendarItems(c.pack),
      suggested_asset_ids: suggested,
    }))
    .filter((item) => item.calendar.length > 0);

  return {
    brand_id,
    channel: WAVE5_FIRST_CHANNEL,
    live_publish_allowed: false,
    items,
  };
}

export function scheduleSocialPublishDryRun(
  input: SocialPublishScheduleRequest,
  opts: SocialPublishRuntimeOpts,
): SocialPublishResult {
  assertWaveEnabled("WAVE_5_SOCIAL_PUBLISH", brandsRootOpt(opts.brandsRoot));
  const req = SocialPublishScheduleRequestSchema.parse(input);
  const brand_id = assertRegisteredBrandId(
    req.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  if (req.channel !== WAVE5_FIRST_CHANNEL) {
    throw new SocialPublishInputError(
      `Wave 5 first channel is ${WAVE5_FIRST_CHANNEL}. ${req.channel} is not wired.`,
    );
  }

  const campaign = requireCampaign(opts.store, brand_id, req.campaign_id);
  assertPackEligible(campaign);
  const calendar = extractSocialCalendarItems(campaign.pack);
  const item = calendar.find((row) => row.key === req.calendar_item_key);
  if (!item) {
    throw new SocialPublishInputError(
      `Calendar item ${req.calendar_item_key} not found on pack ${campaign.pack_id}`,
    );
  }

  const assets = resolveApprovedAssets(brand_id, req.asset_ids, opts.assets);
  const approval = level1ApprovalForCampaign(
    opts.store,
    brand_id,
    campaign.campaign_id,
  );
  const adapter = opts.adapter ?? createSocialPublishAdapter();
  const intended = {
    brand_id,
    channel: WAVE5_FIRST_CHANNEL,
    environment: "non-prod" as const,
    adapter: WAVE5_INSTAGRAM_CHANNEL.adapter,
    caption: item.caption,
    ...(req.scheduled_at ? { scheduled_at: req.scheduled_at } : {}),
    asset_ids: assets.asset_ids,
    media_uris: assets.media_uris,
    campaign_id: campaign.campaign_id,
    pack_id: campaign.pack_id,
    calendar_item_key: item.key,
    calendar_idea: item.idea,
  };
  const dispatched = adapter.dispatch({ payload: intended, dry_run: true });
  const now = new Date().toISOString();
  const outbox = SocialPublishOutboxRecordSchema.parse({
    outbox_id: randomUUID(),
    brand_id,
    channel: WAVE5_FIRST_CHANNEL,
    mode: "DRY_RUN",
    status: dispatched.status,
    dry_run: true,
    would_publish: dispatched.would_publish,
    caption: item.caption,
    ...(req.scheduled_at ? { scheduled_at: req.scheduled_at } : {}),
    asset_ids: assets.asset_ids,
    campaign_id: campaign.campaign_id,
    pack_id: campaign.pack_id,
    calendar_item_key: item.key,
    intended_payload: intended,
    actor: req.actor,
    rationale: req.rationale,
    ...(approval ? { approval_id: approval.approval_id, approval_level: approval.level } : {}),
    live_publish_allowed: false,
    live_publish: false,
    live_ads: false,
    external_side_effects: false,
    created_at: now,
  });
  opts.store.insertSocialOutbox(brand_id, outbox);
  opts.store.appendAudit(brand_id, {
    brand_id,
    event_type: "SOCIAL_PUBLISH_DRY_RUN",
    message: dispatched.message,
    approval_level: approval?.level ?? "LEVEL_1",
    metadata: {
      outbox_id: outbox.outbox_id,
      campaign_id: campaign.campaign_id,
      pack_id: campaign.pack_id,
      calendar_item_key: item.key,
      channel: WAVE5_FIRST_CHANNEL,
      asset_ids: assets.asset_ids,
      actor: req.actor,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
      adapter: WAVE5_INSTAGRAM_CHANNEL.adapter,
    },
  });

  return SocialPublishResultSchema.parse({
    brand_id,
    channel: WAVE5_FIRST_CHANNEL,
    status: "DRY_RUN_OK",
    message: dispatched.message,
    would_publish: true,
    dry_run: true,
    live_publish: false,
    live_ads: false,
    live_publish_allowed: false,
    external_side_effects: false,
    outbox,
  });
}

export function attemptLiveSocialPublish(
  input: {
    brand_id: string;
    campaign_id?: string;
    outbox_id?: string;
    actor?: string;
  },
  opts: SocialPublishRuntimeOpts,
): SocialPublishResult {
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const gates = loadPhaseGates(brandsRootOpt(opts.brandsRoot));
  const level2 = input.campaign_id
    ? level2ApprovalForCampaign(opts.store, brand_id, input.campaign_id)
    : undefined;
  const reasons: string[] = [];
  if (!gates.enabled_waves.includes("WAVE_5_SOCIAL_PUBLISH")) {
    reasons.push("WAVE_5_SOCIAL_PUBLISH is not enabled");
  }
  if (!gates.live_publish_allowed) {
    reasons.push("live_publish_allowed is false");
  }
  if (!isLivePublishOperatorFlagOn()) {
    reasons.push("MOS_LIVE_PUBLISH operator flag is false");
  }
  if (!level2) {
    reasons.push("Level 2 APPROVED approval row is required for live fire");
  }
  reasons.push("Instagram Graph live adapter is not implemented");

  const message = `Live social publish is blocked. ${reasons.join("; ")}. No Instagram API call.`;
  opts.store.appendAudit(brand_id, {
    brand_id,
    event_type: "SOCIAL_PUBLISH_LIVE_BLOCKED",
    message,
    approval_level: "LEVEL_2",
    capability: "PUBLISH_SOCIAL",
    metadata: {
      campaign_id: input.campaign_id ?? null,
      outbox_id: input.outbox_id ?? null,
      actor: input.actor ?? "panel-operator",
      live_publish_allowed: gates.live_publish_allowed,
      operator_flag: isLivePublishOperatorFlagOn(),
      level2_approval_id: level2?.approval_id ?? null,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
    },
  });

  try {
    assertLivePublishAllowed(brandsRootOpt(opts.brandsRoot));
  } catch {
    throw new SocialPublishLiveBlockedError(message);
  }
  if (!level2) {
    throw new SocialPublishLiveBlockedError(message);
  }
  throw new SocialPublishLiveBlockedError(message);
}

export function listSocialPublishOutbox(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): SocialPublishOutboxRecord[] {
  return store.listSocialOutbox(brand_id, opts);
}

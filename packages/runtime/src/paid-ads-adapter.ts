import {
  AdCampaignDraftSchema,
  type AdAdapterId,
  type AdCampaignDraft,
  type AdOutboxStatus,
  type AdPlatform,
} from "@marketing-os/contracts";
import { wave6FixtureForPlatform } from "./fixtures/wave6-paid-ads.js";

export type AdsSource = "fixture" | "meta_api" | "google_ads";

export type PaidAdsDispatchInput = {
  draft: AdCampaignDraft;
  staging: boolean;
  action: "LAUNCH" | "BUDGET_MUTATION";
};

export type PaidAdsDispatchResult = {
  status: AdOutboxStatus;
  would_launch: boolean;
  would_mutate_budget: false;
  message: string;
  adapter: AdAdapterId;
  write_scopes: readonly string[];
  source: AdsSource;
};

export interface PaidAdsAdapter {
  readonly platform: AdPlatform;
  readonly environment: "non-prod";
  readonly source: AdsSource;
  readonly write_scopes: readonly string[];
  dispatch(input: PaidAdsDispatchInput): PaidAdsDispatchResult;
}

export function resolveAdsSource(
  raw: string | undefined = process.env.MOS_ADS_SOURCE,
): AdsSource {
  const value = (raw ?? "fixture").trim().toLowerCase();
  if (value === "meta_api") return "meta_api";
  if (value === "google_ads") return "google_ads";
  return "fixture";
}

function adapterIdFor(platform: AdPlatform): AdAdapterId {
  return platform === "GOOGLE" ? "google_ads_staging" : "meta_ads_staging";
}

export class StagingPaidAdsAdapter implements PaidAdsAdapter {
  readonly environment = "non-prod" as const;
  readonly write_scopes: readonly string[] = [];

  constructor(
    readonly platform: AdPlatform,
    readonly source: AdsSource = "fixture",
  ) {}

  dispatch(input: PaidAdsDispatchInput): PaidAdsDispatchResult {
    const draft = AdCampaignDraftSchema.parse(input.draft);
    const fixture = wave6FixtureForPlatform(draft.platform);
    const adapter = adapterIdFor(draft.platform);

    if (!input.staging) {
      return {
        status: "LIVE_BLOCKED",
        would_launch: false,
        would_mutate_budget: false,
        message: `${draft.platform} live ${input.action.toLowerCase()} is blocked. No credentials used. Set live_ads_allowed + MOS_LIVE_ADS + Level 3 approval after operator approval.`,
        adapter,
        write_scopes: fixture.write_scopes,
        source: this.source,
      };
    }

    const liveLabeled =
      this.source === "meta_api" || this.source === "google_ads";
    const sourceNote = liveLabeled
      ? ` MOS_ADS_SOURCE=${this.source} is a labeled stub — still no network call while live_ads_allowed is false.`
      : "";

    if (input.action === "BUDGET_MUTATION") {
      return {
        status: "STAGING_RECORDED",
        would_launch: false,
        would_mutate_budget: false,
        message: `Staging recorded ${draft.platform} budget recommendation for ${draft.brand_id}. Budget stays recommendation-only. No spend mutation.${sourceNote}`,
        adapter,
        write_scopes: fixture.write_scopes,
        source: this.source,
      };
    }

    return {
      status: "STAGING_RECORDED",
      would_launch: true,
      would_mutate_budget: false,
      message: `Staging recorded ${draft.platform} campaign draft for ${draft.brand_id}. No ${draft.platform} Ads API call.${sourceNote}`,
      adapter,
      write_scopes: fixture.write_scopes,
      source: this.source,
    };
  }
}

export function createPaidAdsAdapter(opts?: {
  platform?: AdPlatform;
  source?: AdsSource;
}): PaidAdsAdapter {
  return new StagingPaidAdsAdapter(
    opts?.platform ?? "META",
    opts?.source ?? resolveAdsSource(),
  );
}

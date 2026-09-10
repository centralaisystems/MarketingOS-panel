import {
  DryRunPublishRequestSchema,
  DryRunPublishResultSchema,
  type DryRunPublishRequest,
  type DryRunPublishResult,
  type PaidRecommendation,
} from "@marketing-os/contracts";
import {
  assertLiveAdsAllowed,
  assertLivePublishAllowed,
  assertWaveEnabled,
} from "../phase-gates.js";

/** Wave 5 — dry-run social publish (live blocked unless gates enabled). */
export function dryRunSocialPublish(
  request: DryRunPublishRequest,
): DryRunPublishResult {
  const req = DryRunPublishRequestSchema.parse(request);
  assertWaveEnabled("WAVE_5_SOCIAL_PUBLISH");

  if (!req.dry_run) {
    assertLivePublishAllowed();
  }

  return DryRunPublishResultSchema.parse({
    brand_id: req.brand_id,
    channel: req.channel,
    status: req.dry_run ? "DRY_RUN_OK" : "BLOCKED",
    message: req.dry_run
      ? `Dry-run OK for ${req.channel}: would publish caption (${req.caption.length} chars). Live publish still gated.`
      : "Live publish requires operator gate enablement.",
    would_publish: req.dry_run,
  });
}

/** Wave 6 — staging ad launch stub (always blocked until live_ads_allowed). */
export function stagingLaunchAd(input: {
  brand_id: string;
  recommendation: PaidRecommendation;
  staging: boolean;
}): { status: "STAGING_RECORDED" | "BLOCKED"; message: string } {
  assertWaveEnabled("WAVE_6_PAID_ADS");
  if (!input.staging) {
    assertLiveAdsAllowed();
  }
  if (input.recommendation.launch_allowed) {
    return {
      status: "BLOCKED",
      message: "Recommendation must keep launch_allowed=false until Level 3 path is approved.",
    };
  }
  return {
    status: "STAGING_RECORDED",
    message: `Staging record only for ${input.brand_id} on ${input.recommendation.platform}. No live spend.`,
  };
}

/** Wave 4 — read-only analytics adapter stub. */
export function readAnalyticsSnapshot(brand_id: string): {
  brand_id: string;
  status: "STUB";
  metrics: Record<string, number>;
  write_scopes: [];
} {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS");
  return {
    brand_id,
    status: "STUB",
    metrics: { impressions: 0, clicks: 0, leads: 0 },
    write_scopes: [],
  };
}

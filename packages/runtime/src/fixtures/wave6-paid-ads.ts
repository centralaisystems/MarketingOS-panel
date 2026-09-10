import {
  AdPlatformFixtureSchema,
  type AdPlatformFixture,
} from "@marketing-os/contracts";

/**
 * Villa Glory first — Meta staging fixture in non-prod.
 * No Meta Marketing API credentials. Staging outbox only.
 */
export const WAVE6_META_PLATFORM: AdPlatformFixture =
  AdPlatformFixtureSchema.parse({
    brand_id: "VILLA_GLORY",
    platform: "META",
    environment: "non-prod",
    adapter: "meta_ads_staging",
    write_scopes: [],
    live_credentials_required: false,
    note: "Fixture Meta ads platform — no Marketing API credentials. Records intended campaign draft + audit only.",
  });

/**
 * Villa Glory Google Ads staging fixture. Same fail-closed live path.
 */
export const WAVE6_GOOGLE_PLATFORM: AdPlatformFixture =
  AdPlatformFixtureSchema.parse({
    brand_id: "VILLA_GLORY",
    platform: "GOOGLE",
    environment: "non-prod",
    adapter: "google_ads_staging",
    write_scopes: [],
    live_credentials_required: false,
    note: "Fixture Google Ads platform — no Ads API credentials. Records intended campaign draft + audit only.",
  });

export function wave6FixtureForPlatform(
  platform: "META" | "GOOGLE",
): AdPlatformFixture {
  return platform === "GOOGLE" ? WAVE6_GOOGLE_PLATFORM : WAVE6_META_PLATFORM;
}

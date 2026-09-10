import {
  InstagramChannelFixtureSchema,
  type InstagramChannelFixture,
} from "@marketing-os/contracts";

/**
 * Villa Glory first channel — Instagram in non-prod.
 * No Graph API credentials. Dry-run outbox only.
 */
export const WAVE5_INSTAGRAM_CHANNEL: InstagramChannelFixture =
  InstagramChannelFixtureSchema.parse({
    brand_id: "VILLA_GLORY",
    channel: "INSTAGRAM",
    environment: "non-prod",
    adapter: "instagram_graph_dry_run",
    write_scopes: [],
    live_credentials_required: false,
    note: "Fixture Instagram channel — no Graph API credentials. Records intended payload + audit only.",
  });

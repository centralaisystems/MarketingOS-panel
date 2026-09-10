import {
  IntendedSocialPostPayloadSchema,
  type IntendedSocialPostPayload,
  type SocialPublishOutboxStatus,
} from "@marketing-os/contracts";
import { WAVE5_INSTAGRAM_CHANNEL } from "./fixtures/wave5-instagram.js";

export type SocialDispatchInput = {
  payload: IntendedSocialPostPayload;
  dry_run: boolean;
};

export type SocialDispatchResult = {
  status: SocialPublishOutboxStatus;
  would_publish: boolean;
  message: string;
  adapter: string;
  write_scopes: readonly string[];
};

export interface SocialPublishAdapter {
  readonly channel: "INSTAGRAM";
  readonly environment: "non-prod";
  dispatch(input: SocialDispatchInput): SocialDispatchResult;
}

export class InstagramGraphDryRunAdapter implements SocialPublishAdapter {
  readonly channel = "INSTAGRAM" as const;
  readonly environment = "non-prod" as const;

  dispatch(input: SocialDispatchInput): SocialDispatchResult {
    const payload = IntendedSocialPostPayloadSchema.parse(input.payload);
    if (!input.dry_run) {
      return {
        status: "LIVE_BLOCKED",
        would_publish: false,
        message:
          "Instagram Graph live fire is blocked. No credentials used. Set live_publish_allowed + MOS_LIVE_PUBLISH + Level 2 approval after operator approval.",
        adapter: WAVE5_INSTAGRAM_CHANNEL.adapter,
        write_scopes: WAVE5_INSTAGRAM_CHANNEL.write_scopes,
      };
    }
    return {
      status: "DRY_RUN_RECORDED",
      would_publish: true,
      message: `Dry-run recorded Instagram payload for ${payload.brand_id} (${payload.caption.length} chars, ${payload.asset_ids.length} asset(s)). No Graph API call.`,
      adapter: WAVE5_INSTAGRAM_CHANNEL.adapter,
      write_scopes: WAVE5_INSTAGRAM_CHANNEL.write_scopes,
    };
  }
}

export function createSocialPublishAdapter(): SocialPublishAdapter {
  return new InstagramGraphDryRunAdapter();
}

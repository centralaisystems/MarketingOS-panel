# Wave 6 — gated paid ads (staging / recommend)

Villa Glory first. Meta is the first wired platform; Google uses the same staging adapter. Default path is **staging**: record the intended campaign draft and a recommendation-only budget, with no Meta/Google Ads API call and no credentials.

## Gates

| Control | This PR |
|---------|---------|
| `WAVE_6_PAID_ADS` | Enabled (recommend / staging) |
| `live_ads_allowed` | **false** |
| `MOS_LIVE_ADS` | Defaults **false** |
| Level 3 approval | Required before any future live launch |
| Meta / Google Ads API | Not implemented |

Do not set `live_ads_allowed` to true without an explicit operator decision. `MOS_ADS_SOURCE=meta_api` / `google_ads` is an optional live-labeled stub that still refuses while `live_ads_allowed` is false. `MOS_LIVE_ADS` is a second fail-closed switch and also defaults false.

## Recommend → stage

1. Build a campaign pack for the active `brand_id` (A10 already emits `PaidRecommendation` with `launch_allowed=false`).
2. Guardian must pass (`approvable=true`).
3. Operator approves the Level 1 inbox item → campaign `INTERNAL_APPROVED`.
4. Panel **Stage (dry-run)** (`POST /api/ads/stage`) or **Stage budget recommendation** (`POST /api/ads/stage-budget`) with actor + rationale.
5. Adapter writes `ad_outbox` + `ad_staging_jobs` status `STAGING_RECORDED` and audit `AD_STAGING_RECORDED` / `AD_BUDGET_STAGING_RECORDED`.
6. Budget stays `kind=RECOMMENDATION` with `mutation_allowed=false`.
7. `live_ads` / `external_side_effects` stay false.

Live fire (`POST /api/ads/launch`, `POST /api/live-ads`) returns **403**, writes `AD_LAUNCH_LIVE_BLOCKED`, and never calls Meta or Google.

## Isolation

Every job and outbox row carries `brand_id`. LOTIN cannot list or stage Villa Glory ads.

Research (A03) never receives `META_ADS_ACCESS_TOKEN` or `GOOGLE_ADS_DEVELOPER_TOKEN`. Those names stay in `.env.example` only; research context is sanitized.

## Out of scope

Real Meta/Google spend, enabling `live_ads_allowed=true`, automation digests. CRM is Wave 7 (opaque `pii_ref` only).

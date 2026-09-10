# Agency waves — implementation status

Updated 2026-09-10 against the Full Agency Roadmap. Enabled waves are only those listed in [`reports/agency/PHASE_GATES.json`](../../reports/agency/PHASE_GATES.json).

| Wave | Status | Notes |
|------|--------|-------|
| 1 Registry | Done | `brands/_shared/REGISTRY.json`, `pnpm create-brand`; `brand_id` via `BrandIdSchema` (not a closed four-brand enum) |
| 2 Content factory | Drafts / pipeline | `pnpm build-campaign-pack` produces Level-1 internal drafts; Guardian reviews content + social + creative; not a full factory; no live publish/ads |
| 3 DB + panel | Scaffolded (not enabled) | `supabase/migrations/...`, `apps/panel` thin UI |
| 4 Analytics/assets | Scaffolded (not enabled) | `readAnalyticsSnapshot` stub; assets table in migration |
| 5 Social publish | Scaffolded (not enabled) | `dryRunSocialPublish` requires WAVE_5; `live_publish_allowed=false` |
| 6 Paid ads | Scaffolded (not enabled) | `stagingLaunchAd` requires WAVE_6; `live_ads_allowed=false` |
| 7 CRM | Scaffolded (not enabled) | `createLeadDraft` requires WAVE_7; opaque `pii_ref` only |
| 8 Automation | Scaffolded (not enabled) | `buildDailyDigest` requires WAVE_8; panel is the early dashboard |

Do not set `live_publish_allowed` or `live_ads_allowed` to true without explicit operator approval. Do not add Wave 3–8 to `enabled_waves` without an explicit gate decision.

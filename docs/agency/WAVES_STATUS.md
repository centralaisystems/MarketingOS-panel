# Agency waves — implementation status

Scaffolded 2026-09-10 against the Full Agency Roadmap.

| Wave | Status | Notes |
|------|--------|-------|
| 1 Registry | Done | `brands/_shared/REGISTRY.json`, `pnpm create-brand` |
| 2 Content factory | Done (drafts) | `pnpm build-campaign-pack`; Social/Creative/Paid recommend; no live |
| 3 DB + panel | Scaffolded | `supabase/migrations/...`, `apps/panel` thin UI |
| 4 Analytics/assets | Scaffolded | `readAnalyticsSnapshot` stub; assets table in migration |
| 5 Social publish | Dry-run only | `dryRunSocialPublish`; `live_publish_allowed=false` |
| 6 Paid ads | Staging stub | `stagingLaunchAd`; `live_ads_allowed=false` |
| 7 CRM | Scaffolded | `createLeadDraft` with opaque `pii_ref` only |
| 8 Automation | Scaffolded | `buildDailyDigest`; panel is the early dashboard |

**Gates:** [`reports/agency/PHASE_GATES.json`](../../reports/agency/PHASE_GATES.json)

Do not set `live_publish_allowed` or `live_ads_allowed` to true without explicit operator approval.

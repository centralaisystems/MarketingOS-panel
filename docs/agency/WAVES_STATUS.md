# Agency waves — implementation status

Updated 2026-09-10 against the Full Agency Roadmap. Enabled waves are only those listed in [`reports/agency/PHASE_GATES.json`](../../reports/agency/PHASE_GATES.json).

| Wave | Status | Notes |
|------|--------|-------|
| 1 Registry | Done | `brands/_shared/REGISTRY.json`, `pnpm create-brand`; `brand_id` via `BrandIdSchema` (not a closed four-brand enum) |
| 2 Content factory | Drafts / pipeline | `pnpm build-campaign-pack` produces Level-1 internal drafts; Guardian reviews content + social + creative; not a full factory; no live publish/ads |
| 3 DB + panel | Usable thin panel (enabled) | Dedicated `apps/panel` at `:8787`. File/memory ops store (campaigns, tasks, approvals, agent_runs, audit, owner reviews, email outbox) with the same `brand_id` contract as `supabase/migrations/202609100001_phase4a_ops.sql` RLS. Operators can switch brands, read readiness/gaps, run director / build a campaign pack, review Level ≤1 inbox, send **templated** owner-review emails (dry-run default), and read the audit trail. Live publish/ads controls are display-only and API-blocked. Supabase is not required for `pnpm test` or local panel. See [`OWNER_REVIEW.md`](./OWNER_REVIEW.md). |
| 4 Analytics/assets | Enabled (read-only) | Asset metadata catalog + object-storage pointer interface (binaries out of Git). Fixture/stub read adapters for GA4, GSC, social, and ads with empty `write_scopes` and UTM contract health. Thin AI search visibility module records fixture probe questions + presence/absence recommendations (Villa Glory first; same API for other brands). No live keys, no live AI-answer probes, no invented VERIFIED commercial claims. Panel sections: asset library, analytics snapshot, AI visibility. Migration: `supabase/migrations/202609100002_wave4_analytics_assets.sql`. |
| 4b Asset pipeline | Enabled (Drive ingest) | Per-brand Drive folder on the registry. Folder contract (`brand-kit/`, `approved-stills/`, `approved-video/`, `raw-inbox/`, `generated/`). Read-only metadata ingest into the Wave 4 catalog with provenance. Fixture Drive for CI (Villa Glory first). Optional live Google Drive behind `MOS_DRIVE_SOURCE=google_drive` — not required for `pnpm test`. No Figma/Higgsfield/video generation. See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md). |
| 5 Social publish | Scaffolded (not enabled) | `dryRunSocialPublish` requires WAVE_5; `live_publish_allowed=false` |
| 6 Paid ads | Scaffolded (not enabled) | `stagingLaunchAd` requires WAVE_6; `live_ads_allowed=false` |
| 7 CRM | Scaffolded (not enabled) | `createLeadDraft` requires WAVE_7; opaque `pii_ref` only |
| Owner review | Enabled (dry-run email) | Opt-in `owner_email` / `owner_email_enabled` on the registry (Villa Glory fixture first). Templated MATERIALS_READY + PROGRESS_DIGEST; ads progress is a stub (not live spend). Owner Approve / Request changes + note. Change notes create Level-1 revision tasks and re-run Guardian. `MOS_EMAIL_MODE=dry_run` by default. |
| 8 Automation | Scaffolded (not enabled) | `buildDailyDigest` requires WAVE_8; no digest UI beyond the Wave 3 audit list |

Do not set `live_publish_allowed` or `live_ads_allowed` to true without explicit operator approval. Do not add Wave 5–8 to `enabled_waves` without an explicit gate decision.

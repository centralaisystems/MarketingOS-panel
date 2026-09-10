# Data model V1 (architecture only — no migrations)

## Phase 4a Core

| Table | Purpose |
|-------|---------|
| brands | Brand registry |
| brand_profiles | Structured knowledge (or sync from Git) |
| tasks | Operational tasks with brand_id |
| campaigns | Campaign records |
| approvals | Approval decisions / actors |
| agent_runs | Agent execution logs |
| marketing_memory | Scoped memory items |
| audit_log | Sensitive/operational audit trail |
| content_items | Draft/published content metadata |

## Later

| Table | Earliest phase |
|-------|----------------|
| campaign_channels, campaign_assets | 4b |
| content_versions, content_publications | 6 |
| assets, asset_usage | 4b |
| competitors, competitor_observations | 3–4 |
| keywords, seo_pages, seo_rankings | 5 |
| ad_campaigns, ad_performance | 7 |
| leads, lead_events, opportunities | 7 (Wave 7 CRM; opaque `pii_ref` only) |
| experiments, experiment_variants, experiment_results | 3+/9 |
| analytics_daily, marketing_costs | 4b–5 |
| insights | 9 |

## Notes

- Agents may remain Git-defined in V1; optional `agents` table only if the dashboard needs dynamic registration.
- RLS must enforce `brand_id` isolation server-side.
- Do not create migrations in Phase 1.

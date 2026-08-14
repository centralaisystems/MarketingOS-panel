# Phase 0 — Architecture Review

Critical review of the Marketing OS master specification. Do not treat the prompt as infallible.

## Verdict

The specification is **directionally strong**: business-result loop, brand isolation, approval levels, task contracts, and a portable core for a future NOX TECH dashboard.

It **over-scopes Phase 1** (database surface + 14 fully built agents + schedule trees) and under-specifies **operator identity**, **isolation evaluation**, **capability enforcement**, and **truth-layer sequencing**.

## What to keep

- Optimize for business result → leads → revenue → learning (not post volume).
- Strict `brand_id` on every operational object.
- Four approval levels; Paid Growth write-locked by default.
- Task + agent-result contracts; controlled workflow states.
- Cursor for engineering/operation now; dashboard later without rewriting the core.
- Explicit MISSING brand fields — never invent facts.

## Contradictions

| Issue | Recommendation |
|-------|----------------|
| 30+ tables vs “do not over-engineer” and Phase 1 “no production integrations” | Phase 1 = TypeScript/Zod contracts only. Phase 4a = 8–12 core tables. Defer ads/SEO/experiments. |
| Cursor as operator vs “Cursor files must not be only operational truth” | Git = agent/brand contracts. Optional file scratch in Phases 1–3. DB becomes SoT for tasks/campaigns/approvals/memory from Phase 4. |
| Nested `marketing-os/` under repo already named MarketingOS | Use repository root. |

## Missing components

1. **Human operator / approver identity** — required before Level 2/3 actions.
2. **Brand-isolation evaluation harness** — tests that attempt cross-brand leakage.
3. **PII / lead data policy** — classify fields before CRM phase.
4. **UAE bilingual (AR/EN)** — first-class for LOTIN and regional brands.
5. **UTM / naming taxonomy contract** — before analytics/content emit tracking.
6. **Memory promotion pipeline** — draft → reviewed → trusted (never raw model opinion → trusted memory).
7. **Integration capability matrix in code** — MCP alone is not policy enforcement.
8. **AI cost / model routing observability** — design hooks even if deferred.

## Unnecessary complexity (defer)

- Full A03–A13 deep behavior on day one (stub contracts; implement Director + Strategist + Content + Guardian first).
- `workflows/daily|weekly|monthly/` trees before Phase 9.
- Empty `campaigns/`, `content/`, `assets/` directories “for completeness”.
- Full experiment / ad / SEO ranking schema before those workflows exist.

## Security concerns

- **Brand bleed via context:** Never load multiple brand packs into one agent context.
- **Global memory:** Default write = brand scope. Global promotion requires Brand Guardian + human Level 2.
- **Secrets:** `.env.local` / secure storage only; `.env.example` names only.
- **Least privilege:** Research must not receive advertising write capabilities.
- **External writes:** Always create audit records; Level 2/3 gates.

## Scalability concerns

- File-only campaign/task state will not survive concurrent work — pull ops DB earlier than full analytics (Phase 4a before 4b).
- Object storage for large creatives — do not commit binaries to Git.
- Dashboard (Phase 10) must call the same contracts/runtime APIs Cursor uses.

## Cursor-specific limitations

| Limit | Implication |
|-------|-------------|
| No durable cron | Jobs = pure functions + later runner (Supabase/Vercel/cron) |
| Weak multi-agent concurrency guarantees | Director orchestrates sequentially with explicit handoffs |
| Context window | Hard brand pack loading; never “all brands” |
| MCP permissions are session-scoped | Enforce capabilities in application code |
| Chat is ephemeral | Persist outcomes to Git (config) or DB (ops), not chat history |

## Recommended architecture adjustments

1. **`packages/contracts`** — single Zod source for BrandId, Task, AgentResult, Approval, WorkflowState, MemoryItem.
2. **`packages/runtime`** — Director orchestration, state machine, validators (framework-agnostic).
3. **Truth layers** — Git / scratch files / Postgres / object storage / external platforms (see table below).
4. **Borrow CoreForm AI authority language** — AI may draft/recommend; may not publish, spend, or contact without human decision.
5. **Phase 4 split** — 4a ops plane; 4b assets + analytics stubs.

### Truth layers

| Layer | Owns | Phase |
|-------|------|-------|
| Git | Agent defs, brand config templates, schemas, docs, rules | 1+ |
| Local/runtime files | Draft tasks, research scratch, unapproved content (optional) | 1–3 |
| Supabase Postgres | Campaigns, tasks, approvals, memory, leads, analytics, audit | 4+ |
| Object storage | Large creatives, exports, video | 4+ |
| External platforms | Published posts, live ads, CRM truth | 6–8 |

## Data model deferral (from full V1 list)

**Phase 4a (required):** `brands`, `brand_profiles`, `tasks`, `campaigns`, `approvals`, `agent_runs`, `content_items`, `marketing_memory`, `audit_log`

**Later:** `campaign_channels`, `campaign_assets`, `content_versions`, `content_publications`, `assets`, `asset_usage`, `competitors`, `competitor_observations`, `keywords`, `seo_pages`, `seo_rankings`, `ad_campaigns`, `ad_performance`, `leads`, `lead_events`, `opportunities`, `experiments*`, `analytics_daily`, `marketing_costs`, `insights`, agents registry (if not Git-only)

Agents may remain Git-defined in V1; optional `agents` table only if the dashboard needs dynamic registration.

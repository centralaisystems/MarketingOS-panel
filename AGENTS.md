# Marketing OS — Agent Instructions

## Mission

Operate a multi-brand AI marketing system for LOTIN, Villa Glory, NOX FORM, and NOX TECH.

Optimize for: **business result → marketing → leads → sales → revenue → learning** — not post volume.

## Phase

**Phase 2 complete through 2D; Agency Waves 1–8 scaffolding in progress.** Provenance-enforced brand packs. Multi-brand registry enabled (`brands/_shared/REGISTRY.json`). No live publishing or ads until phase gates allow. Do not enable `live_publish_allowed` / `live_ads_allowed` without explicit approval.

## Required workflow

1. Read relevant `docs/architecture/` ADRs and brand `profile.json` for the active `brand_id` only.
2. Use `@marketing-os/contracts` schemas for Task / AgentResult / Approval.
3. Delegate via Marketing Director; do not impersonate every specialist in one free-form answer.
4. Run Brand Guardian on outputs intended for humans or later publishing.
5. Mark MISSING / UNVERIFIED / VERIFIED honestly. Never invent brand facts.
6. Run tests after behavior changes (`pnpm test`).
7. Add companies with `pnpm create-brand` — do not hardcode brand IDs in new code.

## Non-negotiable constraints

- Every operational object carries `brand_id`.
- Never load all brand contexts into one task unless an explicit authorized cross-brand operation exists.
- AI may research (local evidence), draft, recommend, and verify. AI may **not** publish, spend, contact customers, or change production websites until the matching wave gate is enabled.
- Level 2 and Level 3 actions may be planned but **execution is blocked** unless gates + approval allow.
- Default memory scope is `BRAND`. Global promotion requires Guardian + human Level 2.
- Never put secrets, tokens, or PII into prompts, logs, fixtures, or memory.
- Do not modify sibling brand product repositories.

## Packages

- `packages/contracts` — Zod schema authority
- `packages/runtime` — orchestration, isolation, approval, guardian, campaign factory
- `apps/panel` — thin operator panel (Wave 3)

## Commands

- `pnpm create-brand -- --id ACME --slug acme --name "Acme Co"`
- `pnpm run-objective -- --brand LOTIN --objective "..."`
- `pnpm build-campaign-pack -- --brand LOTIN --objective "..."`
- `pnpm verify-output -- --file path/to/result.json`
- `pnpm onboard-brand -- LOTIN`
- `pnpm panel` — operator UI at http://127.0.0.1:8787
- `pnpm sync-brand-assets -- --brand VILLA_GLORY` — Wave 4b Drive metadata ingest (fixture default)
- `pnpm arrange-figma -- --brand VILLA_GLORY --sync` — Wave 4b Figma arrange from brand-kit + approved stills (fixture default)
- `pnpm demo` — Phase 1 demonstration scenarios A–E

# Phase 0 — Workspace Audit

**Date:** 2026-08-14  
**Scope:** `/Users/aismacstudio/Development/MarketingOS` (write) · sibling `Development/` repos (read-only)

## Summary

MarketingOS is an empty Git repository: initialized on `master`, **no commits**, **no remote**, **no project files**. Safe greenfield start. Do **not** create a nested `marketing-os/` folder — this repository root *is* Marketing OS.

## Workspace

| Item | Finding |
|------|---------|
| Current directory | `/Users/aismacstudio/Development/MarketingOS` |
| Contents | `.git/` only |
| Git status | On `master` · no commits yet · nothing to commit |
| Remote | Not configured |
| Existing Marketing OS code | None |
| Secrets in this repo | None |

## Sibling landscape (do not modify)

| Path | State | Relevance |
|------|-------|-----------|
| `Lotin/` | Empty | No brand source of truth — onboarding required |
| `Villa-Glory/` | Active (Shopify, Commerce Ops, Creative Tools, Admin) | Product/catalog/creative ops; keep separate |
| `NOXFORM/` | Next.js + Supabase product | Brand kit docs exist; product stays separate |
| `Nox-tech-ai/` | Next.js + Supabase sales/implementation | Future dashboard org affinity; Supabase/RLS patterns |
| `CoreForm/` | Multi-company ops platform | Best pattern library: AGENTS.md, tenancy, AI authority, cursor rules |
| `ExecutiveOS/`, `WhatsApp-Agent/`, `NOX/` | Empty | No reusable artifacts |

## Conflicts / risks

1. **Boundary risk:** Sibling brand product repos must not be absorbed or edited as Marketing OS modules.
2. **LOTIN knowledge gap:** Empty local folder — inventing brand facts is forbidden.
3. **Secret leakage:** Sibling `.env` / `.env.local` files exist — never copy into MarketingOS.
4. **Brand bleed:** Global marketing memory can leak positioning if promotion rules are weak.
5. **Naming collision:** Avoid nesting `marketing-os/` under `MarketingOS`.

## Reusable patterns (conceptual — not code copy)

- **CoreForm:** `companyId` tenancy, AI may recommend not act, ADR discipline, `.cursor/rules` + commands.
- **Nox-tech-ai / NOXFORM:** Supabase RLS posture, `.env.example`, Next.js conventions for Phase 10.
- **Villa Glory Creative Tools:** script/asset safety mindset for later creative workflows.

## Write boundary (non-negotiable)

- Only create/modify files under `MarketingOS/`.
- No production ad/publish account connections.
- No publishing, customer contact, or production website changes.
- No unnecessary infrastructure in Phase 0–1.

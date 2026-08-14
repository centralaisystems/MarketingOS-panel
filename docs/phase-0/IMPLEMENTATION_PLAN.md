# Phase 0 — Implementation Plan

Phased plan refined from the master prompt. **No phase connects production advertising or publishing accounts.**

Interactive companion: Cursor canvas `phase-0-architecture.canvas.tsx` (open beside chat).

---

## Phase 0 — Audit & Design (current)

| | |
|--|--|
| **Objective** | Inspect environment; finalize architecture decisions |
| **Components** | `docs/phase-0/*`, architecture canvas |
| **Dependencies** | Empty repo |
| **Tests** | N/A |
| **Done when** | Audit + critical review + plan accepted; write boundary clear |

---

## Phase 1 — Marketing Core

| | |
|--|--|
| **Objective** | Cursor-operable marketing OS foundation with contracts and isolation |
| **Components** | See file map below |
| **Dependencies** | Phase 0 approval |
| **Tests** | Contract parse tests; workflow transition tests; brand isolation unit tests; approval level policy tests |
| **Done when** | Director can accept an objective + brand_id, produce structured tasks, route to stub/real agents, run Brand Guardian checks; no external writes |

### Phase 1 file map

```
README.md
AGENTS.md
.env.example
.gitignore
package.json                  # workspace root (pnpm or npm) for packages/*
packages/contracts/           # Zod schemas
packages/runtime/             # orchestration + state machine
.brands/ → brands/
  lotin/ PROFILE + MISSING.md
  villa-glory/
  nox-form/
  nox-tech/
agents/
  marketing-director/         # implement
  brand-strategist/           # implement
  content/                    # implement
  brand-guardian/             # implement
  */AGENT.md                  # stubs for A03–A13
workflows/approval/           # Level 0–3 policies
.cursor/rules/
.cursor/commands/
docs/architecture/
tests/
```

### Phase 1 agent priority

- **Implement:** A01 Director, A02 Strategist, A05 Content, A14 Guardian
- **Stub contracts only:** A03–A13
- **Hard non-goals:** ads, publishing, CRM writes, Supabase provisioning (unless explicitly requested)

---

## Phase 2 — Brand Intelligence

| | |
|--|--|
| **Objective** | Populate and validate four brand knowledge packs |
| **Components** | `brands/*/…` structured profiles; onboarding checklist runner |
| **Dependencies** | Phase 1 schemas |
| **Tests** | Schema validation per brand; MISSING fields enumerated; no invented claims |
| **Done when** | Each brand loads cleanly; LOTIN gaps explicit; Villa Glory / NOX FORM / NOX TECH facts sourced from approved materials only |

**Sources (read-only research, not code merge):** Villa-Glory repos, NOXFORM brand kit docs, Nox-tech-ai product docs. LOTIN requires human onboarding.

---

## Phase 3 — Research & Content Factory

| | |
|--|--|
| **Objective** | Enable draft research, strategy, content, creative/video briefs, social calendars, SEO plans |
| **Components** | A03–A09 (+ A11) workflows; templates; Guardian gate |
| **Dependencies** | Phase 2 |
| **Tests** | Handoff fixtures; tone/brand checks; outputs capped at approval Level ≤ 1 |
| **Done when** | End-to-end “objective → draft campaign pack” works offline with citations where applicable |

---

## Phase 4a — Ops Data Plane

| | |
|--|--|
| **Objective** | Durable operational truth in Supabase/Postgres |
| **Components** | Migrations for Phase 4a tables; RLS by `brand_id`; seeds; audit on approvals |
| **Dependencies** | Phase 1 contracts |
| **Tests** | RLS allow/deny cross-brand; migration apply on fresh DB; approval audit row |
| **Done when** | Tasks, campaigns, approvals, memory, agent_runs, audit_log persist; Cursor runtime can read/write via service layer |

## Phase 4b — Asset + Analytics Foundation

| | |
|--|--|
| **Objective** | Asset metadata + analytics/cost stubs |
| **Components** | `assets`, `asset_usage`, `analytics_daily` stub, `marketing_costs` stub; object storage adapter interface |
| **Dependencies** | 4a |
| **Tests** | Query fixture: unused approved Villa Glory living-room assets suitable for a platform |
| **Done when** | Metadata queries work; binaries not in Git |

---

## Phase 5 — Analytics (read-only)

| | |
|--|--|
| **Objective** | Connect GA4 / GSC / social / ad reporting **read** adapters |
| **Components** | `integrations/*` with read-only capability flags; UTM contract enforcement |
| **Dependencies** | 4b + human-provided credentials in secret storage |
| **Tests** | Adapter contract fixtures; assert no write scopes granted |
| **Done when** | Daily metrics land in stubs; tracking health checks exist |

---

## Phase 6 — Controlled Publishing

| | |
|--|--|
| **Objective** | External publishing only behind Level 2+ approval |
| **Components** | Social/web publish adapters; dry-run mode; audit records |
| **Dependencies** | Phase 5 + approval engine |
| **Tests** | Dry-run success; live publish blocked without approval; audit completeness |
| **Done when** | Approved publish path works for one channel in non-prod first |

---

## Phase 7 — Paid Growth

| | |
|--|--|
| **Objective** | Meta/Google recommend; writes require Level 3 |
| **Components** | A10 adapters; budget change gates; capability deny for Research |
| **Dependencies** | Phase 6 patterns |
| **Tests** | Write attempts without Level 3 fail; Research agent cannot obtain ad write tokens |
| **Done when** | Recommendations + approved mutations (staging) with full audit |

---

## Phase 8 — CRM / Revenue Attribution

| | |
|--|--|
| **Objective** | Marketing → leads → opportunities → revenue |
| **Components** | `leads`, `lead_events`, `opportunities`; WhatsApp/form adapters as needed |
| **Dependencies** | 4a + CRM/form sources |
| **Tests** | Attribution integrity; PII handling; brand isolation on leads |
| **Done when** | Campaign success can attach lead/revenue outcomes where data exists |

---

## Phase 9 — Automation

| | |
|--|--|
| **Objective** | Daily / weekly / monthly monitoring cycles |
| **Components** | Job definitions as pure functions + runner; kill switch |
| **Dependencies** | Phases 5–8 proven useful manually |
| **Tests** | Job outputs actionable and concise; failure alerting |
| **Done when** | Scheduled digests run without requiring chat initiation |

---

## Phase 10 — NOX Marketing OS Dashboard

| | |
|--|--|
| **Objective** | Executive web UI on the portable core |
| **Components** | Brand switcher + modules (Today, Campaigns, Approvals, Leads, Analytics, …) |
| **Dependencies** | Workflows proven in Cursor |
| **Tests** | Same contracts as CLI/runtime; cross-brand deny in UI API |
| **Done when** | Dashboard is everyday interface; Cursor remains engineering environment |

---

## Immediate ask

Approve Phase 0 decisions, then authorize **Phase 1 only**.

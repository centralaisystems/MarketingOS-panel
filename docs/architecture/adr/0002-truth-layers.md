# ADR 0002 — Truth layers (Git / runtime / Supabase)

## Status

Accepted (Phase 1)

## Decision

| Layer | Owns |
|-------|------|
| Git | Schemas, agent defs, brand templates, rules, docs |
| Process runtime | In-memory audit, task run results (ephemeral) |
| Supabase (Phase 4+) | tasks, campaigns, approvals, memory, audit_log |
| Object storage (later) | Large creatives |
| External platforms (later) | Published posts, live ads, CRM |

## Consequences

Agent code depends on interfaces/contracts, not on Cursor chat history or a premature DB.

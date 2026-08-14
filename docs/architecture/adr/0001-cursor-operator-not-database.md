# ADR 0001 — Cursor is operator, not durable database

## Status

Accepted (Phase 1)

## Decision

Cursor is the engineering and agent operation environment. It is **not** the durable operational source of truth for campaigns, tasks, approvals, leads, or analytics.

## Consequences

- Git holds contracts, brand config templates, agent definitions, docs.
- Phase 1 runtime may keep in-memory audit/events for a process run.
- Phase 4+ persists operational data in Supabase without rewriting agent logic.

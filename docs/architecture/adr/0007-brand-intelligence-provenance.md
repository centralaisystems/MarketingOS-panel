# ADR 0007 — Brand intelligence provenance (Phase 2)

## Status

Accepted

## Decision

Every material brand fact uses a provenanced field with status
`MISSING | UNVERIFIED | VERIFIED | CONFLICTING | STALE` and explicit source metadata.

`AI_INFERENCE` alone can never be `VERIFIED`.

Conflicts are recorded as `CONFLICTING` — never silently overwritten by authority ranking.

## Consequences

Brand readiness cannot be achieved by filling text without provenance.
Onboarding surfaces gaps honestly.

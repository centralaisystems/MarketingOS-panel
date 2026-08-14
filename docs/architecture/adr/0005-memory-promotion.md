# ADR 0005 — Memory promotion policy

## Status

Accepted (Phase 1)

## Decision

Default memory scope is `BRAND`. Trust lifecycle: `DRAFT → REVIEWED → TRUSTED`.

Global promotion requires Brand Guardian review and human Level 2 approval. Auto-promotion is forbidden. Phase 1 does not persist global promotions.

## Consequences

Unsupported AI opinions must not become TRUSTED memory.

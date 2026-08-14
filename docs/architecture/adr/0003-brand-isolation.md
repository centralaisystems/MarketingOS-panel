# ADR 0003 — Strict brand isolation

## Status

Accepted (Phase 1)

## Decision

Every operational object carries `brand_id`. Runtime loads exactly one brand context per objective unless an explicit authorized `CrossBrandOperation` is provided.

## Consequences

- Contamination scanning on AgentResults
- Isolation tests with adversarial fixtures
- No silent multi-brand context packing

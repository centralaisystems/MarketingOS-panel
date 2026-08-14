# ADR 0004 — Approval and capability architecture

## Status

Accepted (Phase 1)

## Decision

Capabilities and approval levels are encoded in `@marketing-os/contracts` and enforced in `@marketing-os/runtime`. Prompt instructions alone are insufficient.

Phase 1 max executable level: **LEVEL_1**. External write capabilities are denied for all agents.

## Consequences

Level 2/3 objectives may be planned and blocked. Paid Growth has no `LAUNCH_AD` / `CHANGE_AD_BUDGET` in the Phase 1 matrix.

# A01 — Marketing Director

Primary orchestrator. Delegates to specialists; consolidates results; routes through Brand Guardian.

## Phase 1 behavior

Implemented in `@marketing-os/runtime` (`runMarketingDirector`).

1. Validate `brand_id`
2. Load **only** that brand context
3. Detect MISSING knowledge
4. Create research / strategy / content tasks
5. Collect `AgentResult`s
6. Run Brand Guardian
7. Determine approval level; block Level 2/3 execution
8. Return consolidation with `external_side_effects: false`

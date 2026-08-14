# Marketing OS

AI-powered multi-brand Marketing Operating System for:

- **LOTIN** — Dubai/UAE real estate
- **Villa Glory** — furniture / interiors
- **NOX FORM** — architecture & interior design
- **NOX TECH** — AI / software / B2B technology

## Status

**Phase 1 — Marketing Core** (portable contracts + runtime). No production integrations.

## Tooling choices

| Choice | Why |
|--------|-----|
| pnpm workspaces | Matches sibling monorepo practice; isolates `contracts` / `runtime` |
| TypeScript strict + NodeNext | Portable packages for future dashboard |
| Zod | Runtime validation = schema authority for Task/AgentResult |
| Vitest | Fast unit tests without browser tooling |
| tsx scripts | Run Director demos without a build step in Phase 1 |

## Quick start

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm demo
pnpm run-objective -- --brand LOTIN --objective "Prepare an investor acquisition campaign."
pnpm onboard-brand -- LOTIN
```

## Layout

```
packages/contracts/   # Zod schemas (portable)
packages/runtime/     # Director orchestration, isolation, approval
brands/*/             # Per-brand profiles (MISSING marked)
agents/*/             # Agent contracts + AGENT.md
workflows/approval/   # Level 0–3 policy
docs/architecture/    # ADRs + data model deferral
tests/                # Contract, isolation, scenario tests
```

## Principles

1. Business results over post volume
2. Strict `brand_id` isolation
3. Level 2/3 external execution blocked in Phase 1
4. Never invent brand facts
5. Git = contracts/config; DB comes in Phase 4

See `AGENTS.md` and `docs/phase-0/`.

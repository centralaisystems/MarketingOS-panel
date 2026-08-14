# Marketing OS

AI-powered multi-brand Marketing Operating System for:

- **LOTIN** — Dubai/UAE real estate
- **Villa Glory** — furniture / interiors
- **NOX FORM** — architecture & interior design
- **NOX TECH** — AI / software / B2B technology

## Status

**Phase 2 — Brand Intelligence** (honest scaffolds + provenance). Phase 1 core remains intact.

No production integrations.

## Tooling choices

| Choice | Why |
|--------|-----|
| pnpm workspaces | Matches sibling monorepo practice; isolates `contracts` / `runtime` |
| TypeScript strict + NodeNext | Portable packages for future dashboard |
| Zod | Runtime validation = schema authority for Task/AgentResult/BrandPack |
| JSON brand modules | Same shape as requested YAML set; validates natively with Zod (no YAML parse dependency) |
| Vitest | Fast unit tests without browser tooling |
| tsx scripts | Run Director / onboarding without a build step |

## Quick start

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm demo
pnpm onboard-all
pnpm run-objective -- --brand LOTIN --objective "Prepare an investor acquisition campaign."
pnpm onboard-brand -- LOTIN
```

## Layout

```
packages/contracts/   # Zod schemas (portable)
packages/runtime/     # Director + brand intelligence onboarding
brands/<brand>/       # profile.json + IDENTITY/POSITIONING/... modules
brands/_shared/       # RELATIONSHIPS.json (no memory merge)
reports/onboarding/   # Gap reports
agents/*/             # Agent contracts + AGENT.md
docs/architecture/    # ADRs + data model deferral
tests/
```

## Principles

1. Business results over post volume
2. Strict `brand_id` isolation
3. Provenance required for VERIFIED facts
4. Never invent brand facts
5. Level 2/3 external execution blocked until later phases
6. Git = contracts/config; DB comes in Phase 4

See `AGENTS.md` and `docs/phase-0/` / `docs/phase-2/`.

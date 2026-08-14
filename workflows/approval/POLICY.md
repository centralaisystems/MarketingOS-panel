# Approval policy (Phase 1)

| Level | Examples | Phase 1 execution |
|-------|----------|-------------------|
| LEVEL_0 | Research, audits, internal analysis | Allowed |
| LEVEL_1 | Drafts, strategy, creative briefs | Allowed (internal only) |
| LEVEL_2 | Publish social, website production, email send | **Blocked** — plan only |
| LEVEL_3 | Launch ads, budget changes, customer contact, delete public content | **Blocked** — plan only |

Enforced in `@marketing-os/runtime` via `assertExecutableApprovalLevel` and workflow transition guards.

External side effects are always `false` in Phase 1 director runs.

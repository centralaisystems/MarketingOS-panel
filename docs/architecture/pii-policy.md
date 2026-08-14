# PII and data classification policy (Phase 1)

## Classifications

| Class | Examples | Model context | Logs | Global memory |
|-------|----------|---------------|------|---------------|
| PUBLIC | Published URLs, brand display names | Allowed | Allowed | Allowed if verified |
| INTERNAL | Draft strategy, internal metrics | Allowed | Allowed | Brand scope preferred |
| CONFIDENTIAL | Unreleased offers, partner terms | Restricted | Redact | Forbidden |
| PII | Names, phones, emails, WhatsApp IDs | **Forbidden** | **Forbidden** | **Forbidden** |

## Phase 1 rules

- Do not store real lead/contact data.
- Do not put PII into fixtures, prompts, or audit metadata.
- Future lead tables (Phase 8) must classify fields and redact before any model call.
- `EXPORT_PII` capability is denied to all Phase 1 agents.
